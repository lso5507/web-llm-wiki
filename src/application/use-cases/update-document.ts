import type { UpdateDocumentInput } from '../dto/update-document.input.js';
import { DocumentNotFoundError } from '../errors/document-not-found-error.js';
import type { DocumentRepository } from '../ports/document-repository.js';
import type { IndexCatalog } from '../ports/index-catalog.js';
import type { DetectConflictsUseCase } from './detect-conflicts.js';
import type { SuggestLinksUseCase } from './suggest-links.js';
import type { ValidateLinksUseCase } from './validate-links.js';
import { reconcileConflicts } from './reconcile-conflicts.js';
import { DocumentLinks } from '../../domain/wiki/document-links.js';
import { DocumentMetadata } from '../../domain/wiki/document-metadata.js';
import { HierarchyValidator } from '../../domain/wiki/hierarchy-validator.js';
import { IndexEntry } from '../../domain/wiki/index-entry.js';
import { Title } from '../../domain/wiki/title.js';
import { WikiDocument } from '../../domain/wiki/document.js';

const titleToSlug = (title: string): string => title.toLowerCase().replace(/\s+/g, '-');

const normalizeParentSlug = (value: string | null | undefined): string | null => {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

export class UpdateDocumentUseCase {
  constructor(
    private readonly documentRepository: DocumentRepository,
    private readonly indexCatalog: IndexCatalog,
    private readonly linkValidator?: ValidateLinksUseCase,
    private readonly linkSuggester?: SuggestLinksUseCase,
    private readonly conflictDetector?: DetectConflictsUseCase,
  ) {}

  async execute(input: UpdateDocumentInput): Promise<WikiDocument> {
    const existing = await this.documentRepository.findById(input.id);
    if (existing === null) {
      throw new DocumentNotFoundError(input.id);
    }

    const contentChanged = input.content !== undefined;
    const newTitle = input.title !== undefined ? Title.create(input.title) : existing.title;
    const newSlug = newTitle.toSlug();
    const rawNewContent = contentChanged ? (input.content as string) : existing.content;
    const newContent = contentChanged
      ? await this.applyLinkSuggestions(rawNewContent, newSlug)
      : rawNewContent;
    const newTags =
      input.tags !== undefined ? [...input.tags] : [...existing.metadata.tags];
    const newStatus =
      input.status !== undefined ? input.status : existing.metadata.status.value;
    const newDomain = resolveDomainInput(input, existing);

    const parentProvided = 'parentSlug' in input && input.parentSlug !== undefined;
    const newParentSlug = parentProvided
      ? normalizeParentSlug(input.parentSlug)
      : existing.parentSlug;

    if (parentProvided && newParentSlug !== null) {
      await HierarchyValidator.validateNoCircle(
        newSlug,
        newParentSlug,
        this.documentRepository,
      );
    }

    const updatedMetadata = DocumentMetadata.from({
      status: newStatus,
      domain: newDomain,
      tags: newTags,
      conflict: existing.metadata.conflict,
      conflictWith: [...existing.metadata.conflictWith],
      semanticConflicts: [...existing.metadata.semanticConflicts],
    });

    const links = contentChanged
      ? await this.resolveLinks(newContent, newSlug, existing.links)
      : existing.links;

    const updated = WikiDocument.create({
      title: newTitle,
      content: newContent,
      sources: existing.frontmatter.sources.map((source) => ({ ...source })),
      metadata: updatedMetadata,
      links,
      parentSlug: newParentSlug,
    });

    const slugChanged = newSlug !== input.id;
    const removedSlugs = slugChanged ? [input.id] : [];

    if (slugChanged) {
      const previousSummary = await this.findExistingSummary(input.id);
      await this.documentRepository.delete(input.id);
      await this.indexCatalog.remove(input.id);
      await this.documentRepository.save(updated);

      if (previousSummary !== null) {
        await this.indexCatalog.upsert(
          IndexEntry.create({
            title: newTitle.value,
            summary: previousSummary,
            sourceCount: updated.frontmatter.sources.length,
            status: updated.metadata.status,
            domain: updated.metadata.domain,
          }),
        );
      }

      await this.reparentChildren(input.id, newSlug);
    } else {
      await this.documentRepository.save(updated);
    }

    return reconcileConflicts({
      savedDocument: updated,
      documentRepository: this.documentRepository,
      conflictDetector: this.conflictDetector,
      removedSlugs,
    });
  }

  private async findExistingSummary(id: string): Promise<string | null> {
    const entries = await this.indexCatalog.list();
    const match = entries.find((entry) => titleToSlug(entry.title) === id);
    return match ? match.summary : null;
  }

  private async reparentChildren(oldSlug: string, newSlug: string): Promise<void> {
    const all = await this.documentRepository.findAll();
    for (const doc of all) {
      if (doc.parentSlug === oldSlug && doc.title.toSlug() !== newSlug) {
        await this.documentRepository.save(doc.withParent(newSlug));
      }
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

  private async resolveLinks(
    content: string,
    currentDocumentSlug: string,
    fallback: DocumentLinks,
  ): Promise<DocumentLinks> {
    if (!this.linkValidator) {
      return fallback;
    }
    return this.linkValidator.execute({ content, currentDocumentSlug });
  }
}

const resolveDomainInput = (
  input: UpdateDocumentInput,
  existing: WikiDocument,
): string | null => {
  if (!('domain' in input) || input.domain === undefined) {
    return existing.metadata.domain ? existing.metadata.domain.value : null;
  }
  return input.domain;
};
