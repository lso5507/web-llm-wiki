import { describe, expect, it } from 'vitest';

import { GetDocumentUseCase } from '../../../src/application/use-cases/get-document.js';
import type { DocumentRepository } from '../../../src/application/ports/document-repository.js';
import { WikiDocument } from '../../../src/domain/wiki/document.js';
import { Frontmatter } from '../../../src/domain/wiki/frontmatter.js';
import { Title } from '../../../src/domain/wiki/title.js';

class FakeDocumentRepository implements DocumentRepository {
  private readonly documents = new Map<string, WikiDocument>();

  async save(document: WikiDocument): Promise<void> {
    this.documents.set(document.title.toSlug(), document);
  }

  async findByTitle(title: Title): Promise<WikiDocument | null> {
    return this.documents.get(title.toSlug()) ?? null;
  }

  async findById(id: string): Promise<WikiDocument | null> {
    return this.documents.get(id) ?? null;
  }

  async findAll(): Promise<WikiDocument[]> {
    return [...this.documents.values()];
  }

  async delete(id: string): Promise<void> {
    this.documents.delete(id);
  }

  async exists(slug: string): Promise<boolean> {
    return this.documents.has(slug);
  }
}

describe('GetDocumentUseCase', () => {
  it('returns the document when one exists for the given id', async () => {
    const repository = new FakeDocumentRepository();
    await repository.save(
      WikiDocument.create({
        title: Title.create('Orenz Test Account'),
        frontmatter: Frontmatter.create({ tags: ['orenz'] }),
        content: '# body',
      }),
    );
    const useCase = new GetDocumentUseCase(repository);

    const result = await useCase.execute({ id: 'orenz-test-account' });

    expect(result).not.toBeNull();
    expect(result?.title.value).toBe('Orenz Test Account');
    expect(result?.frontmatter.tags).toEqual(['orenz']);
    expect(result?.content).toBe('# body');
  });

  it('returns null when no document exists for the given id', async () => {
    const repository = new FakeDocumentRepository();
    const useCase = new GetDocumentUseCase(repository);

    const result = await useCase.execute({ id: 'missing' });

    expect(result).toBeNull();
  });

  it('delegates lookup to repository.findById without mutating other lookups', async () => {
    const calls: string[] = [];
    const stubRepository: DocumentRepository = {
      async save() {
        // unused
      },
      async findByTitle() {
        return null;
      },
      async findById(id: string) {
        calls.push(id);
        return null;
      },
      async findAll() {
        return [];
      },
      async delete() {
        // unused
      },
      async exists() {
        return false;
      },
    };
    const useCase = new GetDocumentUseCase(stubRepository);

    await useCase.execute({ id: 'lookup-id' });

    expect(calls).toEqual(['lookup-id']);
  });
});
