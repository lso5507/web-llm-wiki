import type { SaveDocumentInput } from '../dto/save-document.input.js';
import { ContentRequiredForSummaryGenerationError } from '../errors/content-required-for-summary-generation-error.js';
import type { DocumentRepository } from '../ports/document-repository.js';
import type { DocumentSummaryGenerator } from '../ports/document-summary-generator.js';
import type { DomainClassifier } from '../ports/domain-classifier.js';
import type { IndexCatalog } from '../ports/index-catalog.js';
import type { SemanticConflictDetector } from '../ports/semantic-conflict-detector.js';
import type { DetectConflictsUseCase } from './detect-conflicts.js';
import type { SuggestLinksUseCase } from './suggest-links.js';
import type { ValidateLinksUseCase } from './validate-links.js';
import { Domain } from '../../domain/wiki/domain.js';
import { DocumentLinks } from '../../domain/wiki/document-links.js';
import { Frontmatter } from '../../domain/wiki/frontmatter.js';
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
    private readonly domainClassifier?: DomainClassifier,
    private readonly linkValidator?: ValidateLinksUseCase,
    private readonly linkSuggester?: SuggestLinksUseCase,
    private readonly conflictDetector?: DetectConflictsUseCase,
    private readonly semanticConflictDetector?: SemanticConflictDetector,
  ) {}

  async execute(input: SaveDocumentInput): Promise<SaveDocumentResult> {
    const title = Title.create(input.title);
    const summary = await this.resolveSummary(input, title.value);
    const domain = await this.resolveDomain(input, title.value);
    const slug = title.toSlug();
    const parentSlug = normalizeParentSlug(input.parentSlug);

    if (parentSlug !== null) {
      await HierarchyValidator.validateNoCircle(slug, parentSlug, this.documentRepository);
    }

    const rawContent = input.content ?? '';
    const content = await this.applyLinkSuggestions(rawContent, slug);
    const links = await this.resolveLinks(content, slug);
    const document = WikiDocument.create({
      title,
      frontmatter: Frontmatter.create({ tags: input.tags, domain, parent: parentSlug }),
      content,
      links,
      parentSlug,
    });
    const indexEntry = IndexEntry.create({
      title: title.value,
      summary,
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
      summary,
      status: 'completed',
    };
  }

  private async resolveSummary(input: SaveDocumentInput, title: string): Promise<string> {
    if (input.summary !== undefined) {
      return input.summary;
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

  private async resolveDomain(input: SaveDocumentInput, title: string): Promise<Domain | null> {
    if (input.domain !== undefined && input.domain !== null) {
      return Domain.from(input.domain);
    }

    if (!this.domainClassifier) {
      return null;
    }

    const content = input.content?.trim();
    if (!content) {
      return null;
    }

    try {
      return await this.domainClassifier.classify(content, title);
    } catch {
      return null;
    }
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

  private async detectSemanticConflictsAsync(document: WikiDocument): Promise<void> {
    if (!this.semanticConflictDetector || document.metadata.domain === null) {
      return;
    }

    const allDocuments = await this.documentRepository.findAll();
    const domain = document.metadata.domain.value;
    const sameDomainDocuments = allDocuments.filter((candidate) => {
      return (
        candidate.title.toSlug() !== document.title.toSlug() &&
        candidate.metadata.domain?.value === domain
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
