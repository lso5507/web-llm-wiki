import type { SaveDocumentInput } from '../dto/save-document.input.js';
import { ContentRequiredForSummaryGenerationError } from '../errors/content-required-for-summary-generation-error.js';
import { DocumentAlreadyExistsError } from '../errors/document-already-exists-error.js';
import type { DocumentRepository } from '../ports/document-repository.js';
import type {
  DocumentSummaryGenerator,
  DocumentSummaryResult,
} from '../ports/document-summary-generator.js';
import type { DomainClassifier } from '../ports/domain-classifier.js';
import type { IndexCatalog } from '../ports/index-catalog.js';
import type { SemanticConflictDetector } from '../ports/semantic-conflict-detector.js';
import type { DetectConflictsUseCase } from './detect-conflicts.js';
import type { SuggestLinksUseCase } from './suggest-links.js';
import type { ValidateLinksUseCase } from './validate-links.js';
import type { DomainNormalizer } from '../services/domain-normalizer.js';
import { Domain } from '../../domain/wiki/domain.js';
import { DocumentLinks } from '../../domain/wiki/document-links.js';
import { DocumentMetadata } from '../../domain/wiki/document-metadata.js';
import { HierarchyValidator } from '../../domain/wiki/hierarchy-validator.js';
import { IndexEntry } from '../../domain/wiki/index-entry.js';
import { Title } from '../../domain/wiki/title.js';
import { WikiDocument } from '../../domain/wiki/document.js';
import { reconcileConflicts } from './reconcile-conflicts.js';

export type SaveDocumentResult = {
  document: WikiDocument;
  summary: string;
  status: 'completed';
};

export class SaveDocumentUseCase {
  constructor(
    private readonly documentRepository: DocumentRepository,
    private readonly indexCatalog: IndexCatalog,
    private readonly documentSummaryGenerator: DocumentSummaryGenerator,
    private readonly domainNormalizer?: DomainNormalizer,
    private readonly domainClassifier?: DomainClassifier,
    private readonly linkValidator?: ValidateLinksUseCase,
    private readonly linkSuggester?: SuggestLinksUseCase,
    private readonly conflictDetector?: DetectConflictsUseCase,
    private readonly semanticConflictDetector?: SemanticConflictDetector,
  ) {}

  async execute(input: SaveDocumentInput): Promise<SaveDocumentResult> {
    const title = Title.create(input.title);
    const slug = title.toSlug();
    if (await this.documentRepository.exists(slug)) {
      throw new DocumentAlreadyExistsError(slug);
    }
    const summaryResult = await this.resolveSummary(input, title.value);
    const domain = await this.resolveDomain(input, title.value, summaryResult);
    const parentSlug = await this.resolveParentSlug(input.parentSlug, domain, slug);

    if (parentSlug !== null) {
      await HierarchyValidator.validateNoCircle(slug, parentSlug, this.documentRepository);
    }

    const rawContent = input.content ?? '';
    const content = await this.applyLinkSuggestions(rawContent, slug);
    const links = await this.resolveLinks(content, slug);
    const metadata = DocumentMetadata.from({
      status: 'published',
      domain: domain ? domain.value : null,
      tags: input.tags ?? [],
    });
    const document = WikiDocument.create({
      title,
      metadata,
      content,
      links,
      parentSlug,
    });
    const indexEntry = IndexEntry.create({
      title: title.value,
      summary: summaryResult.summary,
      sourceCount: document.frontmatter.sources.length,
      status: document.metadata.status,
      domain: document.metadata.domain,
    });

    await this.documentRepository.save(document);
    await this.indexCatalog.upsert(indexEntry);

    const finalDocument = await reconcileConflicts({
      savedDocument: document,
      documentRepository: this.documentRepository,
      conflictDetector: this.conflictDetector,
    });

    if (!input.forceSemanticConflicts) {
      this.detectSemanticConflictsAsync(finalDocument).catch(() => undefined);
    }

    return {
      document: finalDocument,
      summary: summaryResult.summary,
      status: 'completed',
    };
  }

  private async resolveSummary(
    input: SaveDocumentInput,
    title: string,
  ): Promise<DocumentSummaryResult> {
    if (input.summary !== undefined && input.summary !== null) {
      return { summary: input.summary, domain: null, confidence: 1.0 };
    }

    if (!input.content?.trim()) {
      throw new ContentRequiredForSummaryGenerationError();
    }

    return this.documentSummaryGenerator.generate({
      title,
      content: input.content,
      tags: input.tags,
    });
  }

  private async resolveDomain(
    input: SaveDocumentInput,
    title: string,
    summaryResult: DocumentSummaryResult,
  ): Promise<Domain | null> {
    if (input.domain !== undefined && input.domain !== null) {
      return Domain.from(input.domain);
    }

    const koreanLabel = summaryResult.domain;
    if (!koreanLabel || !this.domainNormalizer) {
      return this.fallbackClassifyDomain(input.content, title);
    }

    try {
      const existingDomains = await this.getExistingDomains();
      const result = await this.domainNormalizer.normalize(koreanLabel, {
        title,
        content: input.content ?? '',
        existingDomains,
      });
      return result.domain;
    } catch {
      return this.fallbackClassifyDomain(input.content, title);
    }
  }

  private async fallbackClassifyDomain(
    content: string | undefined,
    title: string,
  ): Promise<Domain | null> {
    if (!this.domainClassifier || !content?.trim()) {
      return null;
    }

    try {
      return await this.domainClassifier.classify(content, title);
    } catch {
      return null;
    }
  }

  private async getExistingDomains() {
    const documents = await this.documentRepository.findAll();
    const domainMap = new Map<string, { label: string; count: number }>();

    for (const doc of documents) {
      const domain = doc.metadata.domain;
      if (!domain) continue;

      const domainId = domain.value;
      const existing = domainMap.get(domainId);
      if (existing) {
        existing.count += 1;
      } else {
        domainMap.set(domainId, {
          label: doc.title.value.split(' ')[0],
          count: 1,
        });
      }
    }

    return Array.from(domainMap.entries()).map(([id, info]) => ({
      id,
      label: info.label,
      documentCount: info.count,
    }));
  }

  private async applyLinkSuggestions(
    content: string,
    currentDocumentSlug: string,
  ): Promise<string> {
    if (!this.linkSuggester || !content) {
      return content;
    }
    try {
      const result = await this.linkSuggester.execute({
        content,
        currentDocumentSlug,
      });
      return result.content;
    } catch {
      return content;
    }
  }

  private async resolveLinks(content: string, currentDocumentSlug: string): Promise<DocumentLinks> {
    if (!this.linkValidator) {
      return DocumentLinks.empty();
    }
    return this.linkValidator.execute({ content, currentDocumentSlug });
  }

  private async resolveParentSlug(
    explicitParentSlug: string | null | undefined,
    domain: Domain | null,
    currentSlug: string,
  ): Promise<string | null> {
    if (explicitParentSlug !== undefined) {
      return normalizeParentSlug(explicitParentSlug);
    }

    if (domain === null) {
      return null;
    }

    const domainRootSlug = domain.value;
    if (currentSlug === domainRootSlug) {
      return null;
    }

    const domainRootExists = await this.documentRepository.exists(domainRootSlug);
    if (!domainRootExists) {
      await this.ensureDomainRootDocument(domain);
    }

    return domainRootSlug;
  }

  private async ensureDomainRootDocument(domain: Domain): Promise<void> {
    const domainRootTitle = Title.create(domain.value);

    const metadata = DocumentMetadata.from({
      status: 'published',
      domain: domain.value,
      tags: [],
    });
    const domainRootDocument = WikiDocument.create({
      title: domainRootTitle,
      metadata,
      content: '',
      links: DocumentLinks.empty(),
      parentSlug: null,
    });
    const indexEntry = IndexEntry.create({
      title: domainRootTitle.value,
      summary: `${domain.value} 도메인 루트 문서`,
      sourceCount: 0,
      status: metadata.status,
      domain: metadata.domain,
    });

    await this.documentRepository.save(domainRootDocument);
    await this.indexCatalog.upsert(indexEntry);

    const finalDocument = await reconcileConflicts({
      savedDocument: domainRootDocument,
      documentRepository: this.documentRepository,
      conflictDetector: this.conflictDetector,
    });

    if (finalDocument !== domainRootDocument) {
      await this.documentRepository.save(finalDocument);
    }
  }

  private async detectSemanticConflictsAsync(document: WikiDocument): Promise<void> {
    if (!this.semanticConflictDetector || document.metadata.domain === null) {
      return;
    }

    const allDocuments = await this.documentRepository.findAll();
    const domain = document.metadata.domain.value;
    const sameDomainDocuments = allDocuments.filter((candidate) => {
      return (
        candidate.title.toSlug() !== document.title.toSlug() &&
        candidate.metadata.domain?.value === domain &&
        candidate.content.trim() !== ''
      );
    });

    const semanticConflicts = await this.semanticConflictDetector.detectConflicts(
      document,
      sameDomainDocuments,
    );

    if (semanticConflicts.length === 0) {
      return;
    }

    await this.documentRepository.save(
      document.withMetadata(
        document.metadata.withSemanticConflicts(semanticConflicts),
      ),
    );
  }
}

const normalizeParentSlug = (value: string | null | undefined): string | null => {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};
