import { describe, expect, it } from 'vitest';
import { CheckStructuralConflictsUseCase } from '../../../src/application/use-cases/check-structural-conflicts.js';
import type { DocumentRepository } from '../../../src/application/ports/document-repository.js';
import { WikiDocument } from '../../../src/domain/wiki/document.js';
import { DocumentMetadata } from '../../../src/domain/wiki/document-metadata.js';
import { Title } from '../../../src/domain/wiki/title.js';

class Repository implements DocumentRepository {
  documents: WikiDocument[] = [];
  async save(document: WikiDocument) { this.documents = [...this.documents.filter((item) => item.title.toSlug() !== document.title.toSlug()), document]; }
  async findByTitle(title: Title) { return this.documents.find((item) => item.title.toSlug() === title.toSlug()) ?? null; }
  async findById(id: string) { return this.documents.find((item) => item.title.toSlug() === id) ?? null; }
  async findAll() { return this.documents; }
  async delete(id: string) { this.documents = this.documents.filter((item) => item.title.toSlug() !== id); }
  async exists(id: string) { return this.documents.some((item) => item.title.toSlug() === id); }
}

describe('CheckStructuralConflictsUseCase', () => {
  it('returns the existing document and reason for a duplicate title', async () => {
    const repository = new Repository();
    await repository.save(WikiDocument.create({ title: Title.create('Existing'), content: 'original body' }));

    const result = await new CheckStructuralConflictsUseCase(repository).execute({ title: 'Existing' });

    expect(result).toEqual([{ id: 'existing', title: 'Existing', content: 'original body', reasons: ['duplicate-title'] }]);
  });

  it('returns documents sharing at least five tags', async () => {
    const repository = new Repository();
    await repository.save(WikiDocument.create({
      title: Title.create('Tagged'),
      content: '',
      metadata: DocumentMetadata.from({ tags: ['1', '2', '3', '4', '5'] }),
    }));

    const result = await new CheckStructuralConflictsUseCase(repository).execute({
      title: 'New', tags: ['1', '2', '3', '4', '5'],
    });

    expect(result[0]?.reasons).toEqual(['shared-tags']);
  });
});
