import { Hono } from 'hono';

import type { DocumentRepository } from '../../application/ports/document-repository.js';
import type {
  DocumentSummaryGenerator,
  DocumentSummaryResult,
} from '../../application/ports/document-summary-generator.js';
import type { DomainClassifier } from '../../application/ports/domain-classifier.js';
import type { IndexCatalog } from '../../application/ports/index-catalog.js';
import type { QuestionAnswerer } from '../../application/ports/question-answerer.js';
import type { SemanticConflictDetector } from '../../application/ports/semantic-conflict-detector.js';
import type { EmbeddingGenerator } from '../../application/ports/embedding-generator.js';
import type { EmbeddingStore } from '../../application/ports/embedding-store.js';
import type { DomainNormalizer } from '../../application/services/domain-normalizer.js';
import { SemanticIndexSearcher } from '../../application/services/semantic-index-searcher.js';
import { SummaryGeneratorNotConfiguredError } from '../../application/errors/summary-generator-not-configured-error.js';
import { AskAIUseCase } from '../../application/use-cases/ask-ai.js';
import { DetectConflictsUseCase } from '../../application/use-cases/detect-conflicts.js';
import { CheckStructuralConflictsUseCase } from '../../application/use-cases/check-structural-conflicts.js';
import { GetDocumentUseCase } from '../../application/use-cases/get-document.js';
import { ListIndexUseCase } from '../../application/use-cases/list-index.js';
import { SaveDocumentUseCase } from '../../application/use-cases/save-document.js';
import { SearchDocumentsUseCase } from '../../application/use-cases/search-documents.js';
import { SuggestLinksUseCase } from '../../application/use-cases/suggest-links.js';
import { UpdateDocumentUseCase } from '../../application/use-cases/update-document.js';
import { DeleteDocumentUseCase } from '../../application/use-cases/delete-document.js';
import { PreviewDocumentUseCase } from '../../application/use-cases/preview-document.js';
import { ValidateLinksUseCase } from '../../application/use-cases/validate-links.js';
import { ListConflictsUseCase } from '../../application/use-cases/list-conflicts.js';
import { OpenRouterSemanticDomainNormalizer } from '../../application/services/openrouter-semantic-domain-normalizer.js';
import { createAskAIRouter } from '../http/routes/ask-ai.js';
import { createDocumentsRouter } from '../http/routes/documents.js';
import { createGetDocumentRouter } from '../http/routes/get-document.js';
import { createIndexRouter } from '../http/routes/index.js';
import { createSearchDocumentsRouter } from '../http/routes/search-documents.js';
import { createUpdateDocumentRouter } from '../http/routes/update-document.js';
import { createDeleteDocumentRouter } from '../http/routes/delete-document.js';
import { createListConflictsRouter } from '../http/routes/list-conflicts.js';
import { createCheckStructuralConflictsRouter } from '../http/routes/check-structural-conflicts.js';
import { createPreviewDocumentRouter } from '../http/routes/preview-document.js';
import { renderHomePage } from '../http/views/home.js';
import { OpenRouterDocumentSummaryGenerator } from '../llm/openrouter-document-summary-generator.js';
import { OpenRouterDomainClassifier } from '../llm/openrouter-domain-classifier.js';
import { OpenRouterQuestionAnswerer } from '../llm/openrouter-question-answerer.js';
import { OpenRouterSemanticConflictDetector } from '../llm/openrouter-semantic-conflict-detector.js';
import { LocalEmbeddingGenerator } from '../llm/local-embedding-generator.js';
import { FileSystemDocumentRepository } from '../persistence/filesystem/file-system-document-repository.js';
import { FileSystemIndexCatalog } from '../persistence/filesystem/file-system-index-catalog.js';
import { InMemoryDocumentRepository } from '../persistence/in-memory/in-memory-document-repository.js';
import { InMemoryIndexCatalog } from '../persistence/in-memory/in-memory-index-catalog.js';
import { InMemoryEmbeddingStore } from '../persistence/in-memory/in-memory-embedding-store.js';
import { loadEnvConfig } from './env.js';

type OpenRouterOptions = {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  siteUrl?: string;
  appName?: string;
  summaryGenerator?: DocumentSummaryGenerator;
  domainClassifier?: DomainClassifier | null;
  domainClassifierModel?: string;
  domainClassifierTimeoutMs?: number;
  questionAnswerer?: QuestionAnswerer;
  questionAnswererModel?: string;
  questionAnswererTimeoutMs?: number;
  semanticConflictDetector?: SemanticConflictDetector | null;
  semanticConflictDetectorModel?: string;
  semanticConflictDetectorTimeoutMs?: number;
  embeddingGenerator?: EmbeddingGenerator | null;
};

type StorageOptions = {
  useFileStorage?: boolean;
  dataRoot?: string;
};

type CreateAppOptions = {
  maxRequestBytes?: number;
  maxStoredDocuments?: number;
  maxStoredBytes?: number;
  openRouter?: OpenRouterOptions;
  storage?: StorageOptions;
};

class SummaryRequiredDocumentSummaryGenerator implements DocumentSummaryGenerator {
  async generate(): Promise<DocumentSummaryResult> {
    throw new SummaryGeneratorNotConfiguredError();
  }
}

export const createApp = (options: CreateAppOptions = {}): Hono => {
  const openRouterOptions = options.openRouter;
  const { documentRepository, indexCatalog } = createPersistenceAdapters(options);
  const openRouterApiKey = openRouterOptions?.apiKey ?? process.env.OPENROUTER_API_KEY;
  const openRouterModel = openRouterOptions?.model ?? process.env.OPENROUTER_MODEL ?? 'openai/gpt-4o-mini';
  const documentSummaryGenerator =
    openRouterOptions?.summaryGenerator ??
    (openRouterApiKey
      ? new OpenRouterDocumentSummaryGenerator({
          apiKey: openRouterApiKey,
          model: openRouterModel,
          baseUrl: openRouterOptions?.baseUrl,
          siteUrl: openRouterOptions?.siteUrl,
          appName: openRouterOptions?.appName,
        })
      : new SummaryRequiredDocumentSummaryGenerator());
  const domainClassifier = resolveDomainClassifier(openRouterOptions, openRouterApiKey, openRouterModel);
  const questionAnswerer = resolveQuestionAnswerer(openRouterOptions, openRouterApiKey, openRouterModel);
  const semanticConflictDetector = resolveSemanticConflictDetector(
    openRouterOptions,
    openRouterApiKey,
    openRouterModel,
  );
  const domainNormalizer: DomainNormalizer | undefined = openRouterApiKey
    ? new OpenRouterSemanticDomainNormalizer({
        apiKey: openRouterApiKey,
        model: openRouterModel,
      })
    : undefined;
  
  const embeddingProvider = process.env.EMBEDDING_PROVIDER ?? 'local';
  const embeddingGenerator = resolveEmbeddingGenerator(embeddingProvider, openRouterOptions);
  const embeddingStore: EmbeddingStore = new InMemoryEmbeddingStore();
  const indexSearcher = embeddingGenerator ? new SemanticIndexSearcher(embeddingStore) : undefined;
  
  const validateLinksUseCase = new ValidateLinksUseCase(documentRepository);
  const suggestLinksUseCase = new SuggestLinksUseCase(documentRepository);
  const detectConflictsUseCase = new DetectConflictsUseCase();
  const checkStructuralConflictsUseCase = new CheckStructuralConflictsUseCase(documentRepository);
  const saveDocumentUseCase = new SaveDocumentUseCase(
    documentRepository,
    indexCatalog,
    documentSummaryGenerator,
    domainNormalizer,
    domainClassifier,
    validateLinksUseCase,
    suggestLinksUseCase,
    detectConflictsUseCase,
    semanticConflictDetector,
  );
  const listIndexUseCase = new ListIndexUseCase(indexCatalog);
  const getDocumentUseCase = new GetDocumentUseCase(documentRepository);
  const searchDocumentsUseCase = new SearchDocumentsUseCase(documentRepository);
  const updateDocumentUseCase = new UpdateDocumentUseCase(
    documentRepository,
    indexCatalog,
    validateLinksUseCase,
    suggestLinksUseCase,
    detectConflictsUseCase,
    semanticConflictDetector,
  );
  const deleteDocumentUseCase = new DeleteDocumentUseCase(documentRepository, indexCatalog);
  const listConflictsUseCase = new ListConflictsUseCase(documentRepository);
  const previewDocumentUseCase = new PreviewDocumentUseCase(
    documentRepository,
    documentSummaryGenerator,
    domainNormalizer,
  );
  const askAIUseCase = questionAnswerer 
    ? new AskAIUseCase(
        documentRepository,
        questionAnswerer,
        embeddingGenerator,
        indexSearcher,
        indexCatalog,
        embeddingStore,
      )
    : null;

  const app = new Hono();

  app.onError(() => {
    return new Response(JSON.stringify({ message: 'internal_error' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  });

  app.get('/', (context) => {
    return context.html(renderHomePage());
  });

  app.route(
    '/documents',
    createDocumentsRouter({
      saveDocumentUseCase,
      maxRequestBytes: options.maxRequestBytes ?? 64 * 1024,
    }),
  );
  app.route('/documents', createSearchDocumentsRouter({ searchDocumentsUseCase }));
  app.route('/documents', createGetDocumentRouter({ getDocumentUseCase }));
  app.route('/documents', createCheckStructuralConflictsRouter({
    useCase: checkStructuralConflictsUseCase,
    maxRequestBytes: options.maxRequestBytes ?? 64 * 1024,
  }));
  app.route(
    '/documents',
    createUpdateDocumentRouter({
      updateDocumentUseCase,
      maxRequestBytes: options.maxRequestBytes ?? 64 * 1024,
    }),
  );
  app.route('/documents', createDeleteDocumentRouter({ deleteDocumentUseCase }));
  app.route(
    '/documents',
    createPreviewDocumentRouter({
      previewDocumentUseCase,
      maxRequestBytes: options.maxRequestBytes ?? 64 * 1024,
    }),
  );
  app.route('/index', createIndexRouter({ listIndexUseCase }));
  app.route('/conflicts', createListConflictsRouter({ listConflictsUseCase }));
  app.route(
    '/ask',
    createAskAIRouter({
      askAIUseCase,
      maxRequestBytes: options.maxRequestBytes ?? 16 * 1024,
    }),
  );

  return app;
};

const resolveEmbeddingGenerator = (
  provider: string,
  openRouterOptions: OpenRouterOptions | undefined,
): EmbeddingGenerator | undefined => {
  if (openRouterOptions?.embeddingGenerator === null) {
    return undefined;
  }
  if (openRouterOptions?.embeddingGenerator) {
    return openRouterOptions.embeddingGenerator;
  }
  
  if (provider === 'local') {
    return new LocalEmbeddingGenerator();
  }
  
  return undefined;
};

const createPersistenceAdapters = (
  options: CreateAppOptions,
): { documentRepository: DocumentRepository; indexCatalog: IndexCatalog } => {
  const envConfig = loadEnvConfig();
  const useFileStorage = options.storage?.useFileStorage ?? envConfig.useFileStorage;

  if (useFileStorage) {
    const dataRoot = options.storage?.dataRoot ?? envConfig.dataRoot;
    return {
      documentRepository: new FileSystemDocumentRepository(dataRoot),
      indexCatalog: new FileSystemIndexCatalog(dataRoot),
    };
  }

  return {
    documentRepository: new InMemoryDocumentRepository({
      maxStoredDocuments: options.maxStoredDocuments,
      maxStoredBytes: options.maxStoredBytes,
    }),
    indexCatalog: new InMemoryIndexCatalog(),
  };
};

const resolveDomainClassifier = (
  openRouterOptions: OpenRouterOptions | undefined,
  apiKey: string | undefined,
  defaultModel: string,
): DomainClassifier | undefined => {
  if (openRouterOptions?.domainClassifier === null) {
    return undefined;
  }
  if (openRouterOptions?.domainClassifier) {
    return openRouterOptions.domainClassifier;
  }
  if (!apiKey) {
    return undefined;
  }
  return new OpenRouterDomainClassifier({
    apiKey,
    model:
      openRouterOptions?.domainClassifierModel ??
      process.env.OPENROUTER_DOMAIN_MODEL ??
      defaultModel,
    baseUrl: openRouterOptions?.baseUrl,
    siteUrl: openRouterOptions?.siteUrl,
    appName: openRouterOptions?.appName,
    timeoutMs: openRouterOptions?.domainClassifierTimeoutMs,
  });
};

const resolveQuestionAnswerer = (
  openRouterOptions: OpenRouterOptions | undefined,
  apiKey: string | undefined,
  defaultModel: string,
): QuestionAnswerer | null => {
  if (openRouterOptions?.questionAnswerer) {
    return openRouterOptions.questionAnswerer;
  }
  if (!apiKey) {
    return null;
  }
  return new OpenRouterQuestionAnswerer({
    apiKey,
    model:
      openRouterOptions?.questionAnswererModel ??
      process.env.OPENROUTER_ASK_MODEL ??
      defaultModel,
    baseUrl: openRouterOptions?.baseUrl,
    siteUrl: openRouterOptions?.siteUrl,
    appName: openRouterOptions?.appName,
    timeoutMs: openRouterOptions?.questionAnswererTimeoutMs,
  });
};

export const resolveSemanticConflictDetector = (
  openRouterOptions: OpenRouterOptions | undefined = undefined,
  apiKey: string | undefined = openRouterOptions?.apiKey ?? process.env.OPENROUTER_API_KEY,
  defaultModel: string = process.env.OPENROUTER_MODEL ?? 'openai/gpt-4o-mini',
): SemanticConflictDetector | undefined => {
  if (openRouterOptions?.semanticConflictDetector === null) {
    return undefined;
  }
  if (openRouterOptions?.semanticConflictDetector) {
    return openRouterOptions.semanticConflictDetector;
  }
  if (!apiKey) {
    return undefined;
  }
  return new OpenRouterSemanticConflictDetector({
    apiKey,
    model:
      openRouterOptions?.semanticConflictDetectorModel ??
      process.env.OPENROUTER_SEMANTIC_CONFLICT_MODEL ??
      defaultModel,
    baseUrl: openRouterOptions?.baseUrl,
    siteUrl: openRouterOptions?.siteUrl,
    appName: openRouterOptions?.appName,
    timeoutMs: openRouterOptions?.semanticConflictDetectorTimeoutMs,
  });
};
