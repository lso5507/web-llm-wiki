import type { DocumentRepository } from '../../../application/ports/document-repository.js';
import { Title } from '../../../domain/wiki/title.js';
import type { WikiDocument } from '../../../domain/wiki/document.js';

export class InMemoryDocumentStorageLimitExceededError extends Error {
  constructor() {
    super('In-memory document storage limit exceeded');
    this.name = 'InMemoryDocumentStorageLimitExceededError';
  }
}

type InMemoryDocumentRepositoryOptions = {
  maxStoredDocuments?: number;
  maxStoredBytes?: number;
};

export class InMemoryDocumentRepository implements DocumentRepository {
  private readonly documents = new Map<string, WikiDocument>();
  private readonly maxStoredDocuments: number;
  private readonly maxStoredBytes: number;

  constructor(options: InMemoryDocumentRepositoryOptions = {}) {
    this.maxStoredDocuments = options.maxStoredDocuments ?? 100;
    this.maxStoredBytes = options.maxStoredBytes ?? 1_000_000;
  }

  async save(document: WikiDocument): Promise<void> {
    const key = document.title.toSlug();
    const previousDocument = this.documents.get(key);
    const nextDocumentCount = previousDocument ? this.documents.size : this.documents.size + 1;
    const nextStoredBytes =
      this.getStoredBytes() - this.getDocumentSize(previousDocument) + this.getDocumentSize(document);

    if (nextDocumentCount > this.maxStoredDocuments || nextStoredBytes > this.maxStoredBytes) {
      throw new InMemoryDocumentStorageLimitExceededError();
    }

    this.documents.set(key, document);
  }

  async findByTitle(title: Title): Promise<WikiDocument | null> {
    return this.documents.get(title.toSlug()) ?? null;
  }

  private getStoredBytes(): number {
    return [...this.documents.values()].reduce((total, document) => total + this.getDocumentSize(document), 0);
  }

  private getDocumentSize(document: WikiDocument | undefined): number {
    if (!document) {
      return 0;
    }

    return Buffer.byteLength(
      JSON.stringify({
        title: document.title.value,
        content: document.content,
        tags: document.frontmatter.tags,
        sources: document.frontmatter.sources,
        conflict: document.frontmatter.conflict,
      }),
      'utf8',
    );
  }
}
