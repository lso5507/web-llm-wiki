import { describe, expect, it } from 'vitest';

import type { DocumentRepository } from '../../../src/application/ports/document-repository.js';
import {
  CircularHierarchyError,
  HierarchyValidator,
} from '../../../src/domain/wiki/hierarchy-validator.js';
import { Title } from '../../../src/domain/wiki/title.js';
import { WikiDocument } from '../../../src/domain/wiki/document.js';

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

const seed = async (
  repository: FakeDocumentRepository,
  slug: string,
  parentSlug: string | null = null,
): Promise<void> => {
  const document = WikiDocument.create({
    title: Title.create(slug),
    content: 'body',
    parentSlug,
  });
  await repository.save(document);
};

describe('HierarchyValidator', () => {
  it('returns successfully when parent is null', async () => {
    const repository = new FakeDocumentRepository();

    await expect(
      HierarchyValidator.validateNoCircle('child', null, repository),
    ).resolves.toBeUndefined();
  });

  it('returns successfully when parent is undefined', async () => {
    const repository = new FakeDocumentRepository();

    await expect(
      HierarchyValidator.validateNoCircle('child', undefined, repository),
    ).resolves.toBeUndefined();
  });

  it('throws CircularHierarchyError when document is its own parent', async () => {
    const repository = new FakeDocumentRepository();

    await expect(
      HierarchyValidator.validateNoCircle('self', 'self', repository),
    ).rejects.toBeInstanceOf(CircularHierarchyError);
  });

  it('returns successfully when parent does not yet exist in repository', async () => {
    const repository = new FakeDocumentRepository();

    await expect(
      HierarchyValidator.validateNoCircle('child', 'unknown-parent', repository),
    ).resolves.toBeUndefined();
  });

  it('returns successfully for a single-level parent chain', async () => {
    const repository = new FakeDocumentRepository();
    await seed(repository, 'parent');

    await expect(
      HierarchyValidator.validateNoCircle('child', 'parent', repository),
    ).resolves.toBeUndefined();
  });

  it('returns successfully for a multi-level parent chain', async () => {
    const repository = new FakeDocumentRepository();
    await seed(repository, 'grandparent');
    await seed(repository, 'parent', 'grandparent');

    await expect(
      HierarchyValidator.validateNoCircle('child', 'parent', repository),
    ).resolves.toBeUndefined();
  });

  it('throws CircularHierarchyError for a 2-cycle (A -> B -> A)', async () => {
    const repository = new FakeDocumentRepository();
    await seed(repository, 'a-slug');
    await seed(repository, 'b-slug', 'a-slug');

    await expect(
      HierarchyValidator.validateNoCircle('a-slug', 'b-slug', repository),
    ).rejects.toBeInstanceOf(CircularHierarchyError);
  });

  it('throws CircularHierarchyError for a 3-cycle (A -> B -> C -> A)', async () => {
    const repository = new FakeDocumentRepository();
    await seed(repository, 'a-slug');
    await seed(repository, 'b-slug', 'a-slug');
    await seed(repository, 'c-slug', 'b-slug');

    await expect(
      HierarchyValidator.validateNoCircle('a-slug', 'c-slug', repository),
    ).rejects.toBeInstanceOf(CircularHierarchyError);
  });

  it('exposes the cycle in the error', async () => {
    const repository = new FakeDocumentRepository();
    await seed(repository, 'a-slug');
    await seed(repository, 'b-slug', 'a-slug');

    try {
      await HierarchyValidator.validateNoCircle('a-slug', 'b-slug', repository);
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(CircularHierarchyError);
      const cycleError = error as CircularHierarchyError;
      expect(cycleError.cycle).toContain('a-slug');
      expect(cycleError.cycle).toContain('b-slug');
    }
  });

  it('does not falsely flag a sibling tree', async () => {
    const repository = new FakeDocumentRepository();
    await seed(repository, 'root');
    await seed(repository, 'sibling-a', 'root');
    await seed(repository, 'sibling-b', 'root');

    await expect(
      HierarchyValidator.validateNoCircle('new-child', 'sibling-a', repository),
    ).resolves.toBeUndefined();
  });

  it('handles a deep hierarchy without false positives', async () => {
    const repository = new FakeDocumentRepository();
    await seed(repository, 'level-0');
    for (let i = 1; i <= 10; i++) {
      await seed(repository, `level-${i}`, `level-${i - 1}`);
    }

    await expect(
      HierarchyValidator.validateNoCircle('new-leaf', 'level-10', repository),
    ).resolves.toBeUndefined();
  });
});
