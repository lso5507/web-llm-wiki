import { describe, expect, it } from 'vitest';

import { SaveDocumentUseCase } from '../../../src/application/use-cases/save-document.js';
import type { IndexCatalog } from '../../../src/application/ports/index-catalog.js';
import type { DocumentRepository } from '../../../src/application/ports/document-repository.js';
import type { DocumentSummaryGenerator } from '../../../src/application/ports/document-summary-generator.js';
import { IndexEntry } from '../../../src/domain/wiki/index-entry.js';
import { Title } from '../../../src/domain/wiki/title.js';
import type { WikiDocument } from '../../../src/domain/wiki/document.js';

class FakeDocumentRepository implements DocumentRepository {
  private readonly documents = new Map<string, WikiDocument>();

  async save(document: WikiDocument): Promise<void> {
    this.documents.set(document.title.toSlug(), document);
  }

  async findByTitle(title: Title): Promise<WikiDocument | null> {
    return this.documents.get(title.toSlug()) ?? null;
  }

  count(): number {
    return this.documents.size;
  }
}

class FakeIndexCatalog implements IndexCatalog {
  private readonly entries = new Map<string, IndexEntry>();

  async upsert(entry: IndexEntry): Promise<void> {
    this.entries.set(entry.title, entry);
  }

  async list(): Promise<IndexEntry[]> {
    return [...this.entries.values()].sort(IndexEntry.compareByTitle);
  }
}

class FakeDocumentSummaryGenerator implements DocumentSummaryGenerator {
  public callCount = 0;

  constructor(private readonly generatedSummary: string) {}

  async generate(input: { title: string; content: string; tags?: string[] }): Promise<string> {
    this.callCount += 1;
    return `${this.generatedSummary}:${input.title}`;
  }
}

describe('SaveDocumentUseCase', () => {
  it('saves a new document and writes one index entry', async () => {
    const repository = new FakeDocumentRepository();
    const indexCatalog = new FakeIndexCatalog();
    const useCase = new SaveDocumentUseCase(repository, indexCatalog, new FakeDocumentSummaryGenerator('unused'));

    await useCase.execute({ title: 'Orenz Test Account', summary: 'Test account credentials' });

    expect(repository.count()).toBe(1);
    expect(await repository.findByTitle(Title.create('Orenz Test Account'))).not.toBeNull();
    expect(await indexCatalog.list()).toEqual([
      IndexEntry.create({ title: 'Orenz Test Account', summary: 'Test account credentials' }),
    ]);
  });

  it('upserts the same title instead of duplicating it', async () => {
    const repository = new FakeDocumentRepository();
    const indexCatalog = new FakeIndexCatalog();
    const useCase = new SaveDocumentUseCase(repository, indexCatalog, new FakeDocumentSummaryGenerator('unused'));

    await useCase.execute({ title: 'Orenz Test Account', summary: 'old summary' });
    await useCase.execute({ title: 'Orenz Test Account', summary: 'new summary' });

    expect(repository.count()).toBe(1);
    expect(await indexCatalog.list()).toEqual([
      IndexEntry.create({ title: 'Orenz Test Account', summary: 'new summary' }),
    ]);
  });

  it('rejects an empty title and does not mutate state', async () => {
    const repository = new FakeDocumentRepository();
    const indexCatalog = new FakeIndexCatalog();
    const useCase = new SaveDocumentUseCase(repository, indexCatalog, new FakeDocumentSummaryGenerator('unused'));

    await expect(useCase.execute({ title: '   ', summary: 'anything' })).rejects.toThrow('Title must not be empty');

    expect(repository.count()).toBe(0);
    expect(await indexCatalog.list()).toEqual([]);
  });

  it('rejects an empty summary and does not mutate state', async () => {
    const repository = new FakeDocumentRepository();
    const indexCatalog = new FakeIndexCatalog();
    const useCase = new SaveDocumentUseCase(repository, indexCatalog, new FakeDocumentSummaryGenerator('unused'));

    await expect(useCase.execute({ title: 'Valid Title', summary: '   ' })).rejects.toThrow(
      'Index entry summary must not be empty',
    );

    expect(repository.count()).toBe(0);
    expect(await indexCatalog.list()).toEqual([]);
  });

  it('generates a summary when one is not provided', async () => {
    const repository = new FakeDocumentRepository();
    const indexCatalog = new FakeIndexCatalog();
    const summaryGenerator = new FakeDocumentSummaryGenerator('Generated summary');
    const useCase = new SaveDocumentUseCase(repository, indexCatalog, summaryGenerator);

    await useCase.execute({ title: 'Orenz Test Account', content: 'Raw markdown body' });

    expect(summaryGenerator.callCount).toBe(1);
    expect(await indexCatalog.list()).toEqual([
      IndexEntry.create({ title: 'Orenz Test Account', summary: 'Generated summary:Orenz Test Account' }),
    ]);
  });

  it('requires content when summary generation is needed', async () => {
    const repository = new FakeDocumentRepository();
    const indexCatalog = new FakeIndexCatalog();
    const useCase = new SaveDocumentUseCase(repository, indexCatalog, new FakeDocumentSummaryGenerator('unused'));

    await expect(useCase.execute({ title: 'Orenz Test Account' })).rejects.toThrow(
      'content is required when summary is omitted',
    );

    expect(repository.count()).toBe(0);
    expect(await indexCatalog.list()).toEqual([]);
  });
});
