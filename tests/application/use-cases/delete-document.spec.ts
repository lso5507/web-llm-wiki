import { describe, expect, it, vi } from 'vitest';

import type { DocumentRepository } from '../../../src/application/ports/document-repository.js';
import type { IndexCatalog } from '../../../src/application/ports/index-catalog.js';
import { DeleteDocumentUseCase } from '../../../src/application/use-cases/delete-document.js';
import { DocumentMetadata } from '../../../src/domain/wiki/document-metadata.js';
import { Frontmatter } from '../../../src/domain/wiki/frontmatter.js';
import { IndexEntry } from '../../../src/domain/wiki/index-entry.js';
import { Title } from '../../../src/domain/wiki/title.js';
import { WikiDocument } from '../../../src/domain/wiki/document.js';

class FakeDocumentRepository implements DocumentRepository {
  private readonly documents = new Map<string, WikiDocument>();
  public deleteCallCount = 0;
  public deleteCalledWith: string[] = [];

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
    this.deleteCallCount += 1;
    this.deleteCalledWith.push(id);
    this.documents.delete(id);
  }

  async exists(slug: string): Promise<boolean> {
    return this.documents.has(slug);
  }
}

class FakeIndexCatalog implements IndexCatalog {
  private readonly entries = new Map<string, IndexEntry>();
  public removeCallCount = 0;
  public removeCalledWith: string[] = [];

  async upsert(entry: IndexEntry): Promise<void> {
    this.entries.set(entry.title, entry);
  }

  async list(): Promise<IndexEntry[]> {
    return [...this.entries.values()].sort(IndexEntry.compareByTitle);
  }

  async remove(id: string): Promise<void> {
    this.removeCallCount += 1;
    this.removeCalledWith.push(id);
    for (const [key, entry] of this.entries) {
      if (entry.title.toLowerCase().replace(/\s+/g, '-') === id) {
        this.entries.delete(key);
        return;
      }
    }
  }
}

describe('DeleteDocumentUseCase', () => {
  it('removes the document and the matching index entry', async () => {
    const repository = new FakeDocumentRepository();
    const indexCatalog = new FakeIndexCatalog();
    await repository.save(
      WikiDocument.create({
        title: Title.create('Foo Bar'),
        frontmatter: Frontmatter.create({}),
        content: 'body',
      }),
    );
    await indexCatalog.upsert(IndexEntry.create({ title: 'Foo Bar', summary: 'summary' }));
    const useCase = new DeleteDocumentUseCase(repository, indexCatalog);

    await useCase.execute({ id: 'foo-bar' });

    expect(await repository.findById('foo-bar')).toBeNull();
    expect(await indexCatalog.list()).toEqual([]);
  });

  it('calls both repository.delete and indexCatalog.remove with the same id', async () => {
    const repository = new FakeDocumentRepository();
    const indexCatalog = new FakeIndexCatalog();
    const repositoryDeleteSpy = vi.spyOn(repository, 'delete');
    const indexRemoveSpy = vi.spyOn(indexCatalog, 'remove');
    await repository.save(
      WikiDocument.create({
        title: Title.create('Spy Target'),
        frontmatter: Frontmatter.create({}),
        content: 'body',
      }),
    );
    await indexCatalog.upsert(IndexEntry.create({ title: 'Spy Target', summary: 'summary' }));
    const useCase = new DeleteDocumentUseCase(repository, indexCatalog);

    await useCase.execute({ id: 'spy-target' });

    expect(repositoryDeleteSpy).toHaveBeenCalledTimes(1);
    expect(repositoryDeleteSpy).toHaveBeenCalledWith('spy-target');
    expect(indexRemoveSpy).toHaveBeenCalledTimes(1);
    expect(indexRemoveSpy).toHaveBeenCalledWith('spy-target');
  });

  it('removes from index even when the document was already deleted from repository', async () => {
    const repository = new FakeDocumentRepository();
    const indexCatalog = new FakeIndexCatalog();
    await indexCatalog.upsert(IndexEntry.create({ title: 'Orphan Entry', summary: 'summary' }));
    const useCase = new DeleteDocumentUseCase(repository, indexCatalog);

    await useCase.execute({ id: 'orphan-entry' });

    expect(repository.deleteCallCount).toBe(1);
    expect(indexCatalog.removeCallCount).toBe(1);
    expect(await indexCatalog.list()).toEqual([]);
  });

  it('is idempotent when deleting a non-existent id', async () => {
    const repository = new FakeDocumentRepository();
    const indexCatalog = new FakeIndexCatalog();
    const useCase = new DeleteDocumentUseCase(repository, indexCatalog);

    await expect(useCase.execute({ id: 'never-existed' })).resolves.toBeUndefined();
    expect(repository.deleteCallCount).toBe(1);
    expect(indexCatalog.removeCallCount).toBe(1);
  });

  it('is idempotent when called twice on the same existing document', async () => {
    const repository = new FakeDocumentRepository();
    const indexCatalog = new FakeIndexCatalog();
    await repository.save(
      WikiDocument.create({
        title: Title.create('Double Delete'),
        frontmatter: Frontmatter.create({}),
        content: 'body',
      }),
    );
    await indexCatalog.upsert(IndexEntry.create({ title: 'Double Delete', summary: 'summary' }));
    const useCase = new DeleteDocumentUseCase(repository, indexCatalog);

    await expect(useCase.execute({ id: 'double-delete' })).resolves.toBeUndefined();
    await expect(useCase.execute({ id: 'double-delete' })).resolves.toBeUndefined();

    expect(repository.deleteCallCount).toBe(2);
    expect(indexCatalog.removeCallCount).toBe(2);
    expect(await repository.findById('double-delete')).toBeNull();
    expect(await indexCatalog.list()).toEqual([]);
  });

  it('does not affect unrelated documents and entries', async () => {
    const repository = new FakeDocumentRepository();
    const indexCatalog = new FakeIndexCatalog();
    await repository.save(
      WikiDocument.create({
        title: Title.create('Keep Me'),
        frontmatter: Frontmatter.create({}),
        content: 'body',
      }),
    );
    await repository.save(
      WikiDocument.create({
        title: Title.create('Remove Me'),
        frontmatter: Frontmatter.create({}),
        content: 'body',
      }),
    );
    await indexCatalog.upsert(IndexEntry.create({ title: 'Keep Me', summary: 'keep' }));
    await indexCatalog.upsert(IndexEntry.create({ title: 'Remove Me', summary: 'remove' }));
    const useCase = new DeleteDocumentUseCase(repository, indexCatalog);

    await useCase.execute({ id: 'remove-me' });

    expect(await repository.findById('keep-me')).not.toBeNull();
    expect(await repository.findById('remove-me')).toBeNull();
    expect(await indexCatalog.list()).toEqual([
      IndexEntry.create({ title: 'Keep Me', summary: 'keep' }),
    ]);
  });

  describe('conflict reconciliation', () => {
    it('removes the deleted slug from referrers conflictWith and clears conflict flag when empty', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      await repository.save(
        WikiDocument.create({
          title: Title.create('Referrer'),
          content: 'body',
          metadata: DocumentMetadata.from({
            tags: ['t'],
            conflict: true,
            conflictWith: ['target'],
          }),
        }),
      );
      await repository.save(
        WikiDocument.create({
          title: Title.create('Target'),
          content: 'body',
          metadata: DocumentMetadata.from({
            tags: ['t'],
            conflict: true,
            conflictWith: ['referrer'],
          }),
        }),
      );
      const useCase = new DeleteDocumentUseCase(repository, indexCatalog);

      await useCase.execute({ id: 'target' });

      const referrer = await repository.findById('referrer');
      expect(referrer?.metadata.conflict).toBe(false);
      expect([...(referrer?.metadata.conflictWith ?? [])]).toEqual([]);
    });

    it('keeps the conflict flag when other conflictWith entries remain', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      await repository.save(
        WikiDocument.create({
          title: Title.create('Referrer'),
          content: 'body',
          metadata: DocumentMetadata.from({
            tags: ['t'],
            conflict: true,
            conflictWith: ['target', 'other'],
          }),
        }),
      );
      await repository.save(
        WikiDocument.create({
          title: Title.create('Target'),
          content: 'body',
          metadata: DocumentMetadata.from({
            tags: ['t'],
            conflict: true,
            conflictWith: ['referrer'],
          }),
        }),
      );
      const useCase = new DeleteDocumentUseCase(repository, indexCatalog);

      await useCase.execute({ id: 'target' });

      const referrer = await repository.findById('referrer');
      expect(referrer?.metadata.conflict).toBe(true);
      expect([...(referrer?.metadata.conflictWith ?? [])]).toEqual(['other']);
    });

    it('does not modify documents that did not reference the deleted slug', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      await repository.save(
        WikiDocument.create({
          title: Title.create('Untouched'),
          content: 'body',
          metadata: DocumentMetadata.from({ tags: ['x'] }),
        }),
      );
      await repository.save(
        WikiDocument.create({
          title: Title.create('Target'),
          content: 'body',
          metadata: DocumentMetadata.from({ tags: ['t'] }),
        }),
      );
      const useCase = new DeleteDocumentUseCase(repository, indexCatalog);

      await useCase.execute({ id: 'target' });

      const untouched = await repository.findById('untouched');
      expect(untouched?.metadata.conflict).toBe(false);
      expect([...(untouched?.metadata.conflictWith ?? [])]).toEqual([]);
    });

    it('reconciles multiple referrers in a single delete', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      await repository.save(
        WikiDocument.create({
          title: Title.create('Alpha'),
          content: 'body',
          metadata: DocumentMetadata.from({
            tags: ['t'],
            conflict: true,
            conflictWith: ['target'],
          }),
        }),
      );
      await repository.save(
        WikiDocument.create({
          title: Title.create('Beta'),
          content: 'body',
          metadata: DocumentMetadata.from({
            tags: ['t'],
            conflict: true,
            conflictWith: ['target'],
          }),
        }),
      );
      await repository.save(
        WikiDocument.create({
          title: Title.create('Target'),
          content: 'body',
        }),
      );
      const useCase = new DeleteDocumentUseCase(repository, indexCatalog);

      await useCase.execute({ id: 'target' });

      const alpha = await repository.findById('alpha');
      const beta = await repository.findById('beta');
      expect(alpha?.metadata.conflict).toBe(false);
      expect([...(alpha?.metadata.conflictWith ?? [])]).toEqual([]);
      expect(beta?.metadata.conflict).toBe(false);
      expect([...(beta?.metadata.conflictWith ?? [])]).toEqual([]);
    });

    it('is idempotent when the deleted slug is not referenced anywhere', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      await repository.save(
        WikiDocument.create({
          title: Title.create('Solo'),
          content: 'body',
        }),
      );
      const useCase = new DeleteDocumentUseCase(repository, indexCatalog);

      await expect(useCase.execute({ id: 'solo' })).resolves.toBeUndefined();
      await expect(useCase.execute({ id: 'solo' })).resolves.toBeUndefined();
    });
  });

  describe('hierarchy reparenting', () => {
    it('clears parentSlug on direct children when parent is deleted', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      await repository.save(
        WikiDocument.create({
          title: Title.create('Parent'),
          content: 'body',
        }),
      );
      await repository.save(
        WikiDocument.create({
          title: Title.create('Child'),
          content: 'body',
          parentSlug: 'parent',
        }),
      );
      const useCase = new DeleteDocumentUseCase(repository, indexCatalog);

      await useCase.execute({ id: 'parent' });

      const child = await repository.findById('child');
      expect(child).not.toBeNull();
      expect(child?.parentSlug).toBeNull();
    });

    it('clears parentSlug on multiple direct children', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      await repository.save(
        WikiDocument.create({
          title: Title.create('Parent'),
          content: 'body',
        }),
      );
      await repository.save(
        WikiDocument.create({
          title: Title.create('Child One'),
          content: 'body',
          parentSlug: 'parent',
        }),
      );
      await repository.save(
        WikiDocument.create({
          title: Title.create('Child Two'),
          content: 'body',
          parentSlug: 'parent',
        }),
      );
      const useCase = new DeleteDocumentUseCase(repository, indexCatalog);

      await useCase.execute({ id: 'parent' });

      const childOne = await repository.findById('child-one');
      const childTwo = await repository.findById('child-two');
      expect(childOne?.parentSlug).toBeNull();
      expect(childTwo?.parentSlug).toBeNull();
    });

    it('does not affect grandchildren (only direct children become orphans)', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      await repository.save(
        WikiDocument.create({
          title: Title.create('Grandparent'),
          content: 'body',
        }),
      );
      await repository.save(
        WikiDocument.create({
          title: Title.create('Parent'),
          content: 'body',
          parentSlug: 'grandparent',
        }),
      );
      await repository.save(
        WikiDocument.create({
          title: Title.create('Grandchild'),
          content: 'body',
          parentSlug: 'parent',
        }),
      );
      const useCase = new DeleteDocumentUseCase(repository, indexCatalog);

      await useCase.execute({ id: 'grandparent' });

      const parent = await repository.findById('parent');
      const grandchild = await repository.findById('grandchild');
      expect(parent?.parentSlug).toBeNull();
      expect(grandchild?.parentSlug).toBe('parent');
    });

    it('does not modify documents that are not children of the deleted document', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      await repository.save(
        WikiDocument.create({
          title: Title.create('Target'),
          content: 'body',
        }),
      );
      await repository.save(
        WikiDocument.create({
          title: Title.create('Unrelated Root'),
          content: 'body',
        }),
      );
      await repository.save(
        WikiDocument.create({
          title: Title.create('Unrelated Child'),
          content: 'body',
          parentSlug: 'unrelated-root',
        }),
      );
      const useCase = new DeleteDocumentUseCase(repository, indexCatalog);

      await useCase.execute({ id: 'target' });

      const unrelatedRoot = await repository.findById('unrelated-root');
      const unrelatedChild = await repository.findById('unrelated-child');
      expect(unrelatedRoot?.parentSlug).toBeNull();
      expect(unrelatedChild?.parentSlug).toBe('unrelated-root');
    });

    it('is idempotent when no children exist', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      await repository.save(
        WikiDocument.create({
          title: Title.create('Childless'),
          content: 'body',
        }),
      );
      const useCase = new DeleteDocumentUseCase(repository, indexCatalog);

      await expect(useCase.execute({ id: 'childless' })).resolves.toBeUndefined();
      await expect(useCase.execute({ id: 'childless' })).resolves.toBeUndefined();
    });
  });
});
