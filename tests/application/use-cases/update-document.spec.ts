import { describe, expect, it, vi } from 'vitest';

import type { DocumentRepository } from '../../../src/application/ports/document-repository.js';
import type { IndexCatalog } from '../../../src/application/ports/index-catalog.js';
import { DocumentNotFoundError } from '../../../src/application/errors/document-not-found-error.js';
import { DetectConflictsUseCase } from '../../../src/application/use-cases/detect-conflicts.js';
import { SuggestLinksUseCase } from '../../../src/application/use-cases/suggest-links.js';
import { UpdateDocumentUseCase } from '../../../src/application/use-cases/update-document.js';
import { ValidateLinksUseCase } from '../../../src/application/use-cases/validate-links.js';
import { DocumentLinks } from '../../../src/domain/wiki/document-links.js';
import { DocumentMetadata } from '../../../src/domain/wiki/document-metadata.js';
import { Frontmatter } from '../../../src/domain/wiki/frontmatter.js';
import { IndexEntry } from '../../../src/domain/wiki/index-entry.js';
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

  async remove(id: string): Promise<void> {
    for (const [key, entry] of this.entries) {
      if (entry.title.toLowerCase().replace(/\s+/g, '-') === id) {
        this.entries.delete(key);
        return;
      }
    }
  }
}

const seedDocument = async (
  repository: FakeDocumentRepository,
  indexCatalog: FakeIndexCatalog,
  overrides: { title?: string; content?: string; tags?: string[]; summary?: string } = {},
): Promise<WikiDocument> => {
  const title = Title.create(overrides.title ?? 'Foo Bar');
  const document = WikiDocument.create({
    title,
    frontmatter: Frontmatter.create({ tags: overrides.tags ?? ['old-tag'] }),
    content: overrides.content ?? 'old content',
  });
  await repository.save(document);
  await indexCatalog.upsert(
    IndexEntry.create({
      title: title.value,
      summary: overrides.summary ?? 'old summary',
    }),
  );
  return document;
};

describe('UpdateDocumentUseCase', () => {
  it('updates the title and persists the document', async () => {
    const repository = new FakeDocumentRepository();
    const indexCatalog = new FakeIndexCatalog();
    await seedDocument(repository, indexCatalog);
    const useCase = new UpdateDocumentUseCase(repository, indexCatalog);

    const updated = await useCase.execute({ id: 'foo-bar', title: 'Foo Baz' });

    expect(updated.title.value).toBe('Foo Baz');
    expect(updated.content).toBe('old content');
    expect(await repository.findById('foo-baz')).not.toBeNull();
  });

  it('updates the content while preserving title and tags', async () => {
    const repository = new FakeDocumentRepository();
    const indexCatalog = new FakeIndexCatalog();
    await seedDocument(repository, indexCatalog, { tags: ['t1', 't2'] });
    const useCase = new UpdateDocumentUseCase(repository, indexCatalog);

    const updated = await useCase.execute({ id: 'foo-bar', content: 'new content' });

    expect(updated.title.value).toBe('Foo Bar');
    expect(updated.content).toBe('new content');
    expect([...updated.frontmatter.tags]).toEqual(['t1', 't2']);
    const reloaded = await repository.findById('foo-bar');
    expect(reloaded?.content).toBe('new content');
  });

  it('updates the tags and persists them', async () => {
    const repository = new FakeDocumentRepository();
    const indexCatalog = new FakeIndexCatalog();
    await seedDocument(repository, indexCatalog, { tags: ['old'] });
    const useCase = new UpdateDocumentUseCase(repository, indexCatalog);

    const updated = await useCase.execute({ id: 'foo-bar', tags: ['fresh', 'tags'] });

    expect([...updated.frontmatter.tags]).toEqual(['fresh', 'tags']);
    const reloaded = await repository.findById('foo-bar');
    expect([...(reloaded?.frontmatter.tags ?? [])]).toEqual(['fresh', 'tags']);
  });

  it('only updates provided fields (partial update)', async () => {
    const repository = new FakeDocumentRepository();
    const indexCatalog = new FakeIndexCatalog();
    await seedDocument(repository, indexCatalog, {
      content: 'original content',
      tags: ['original'],
    });
    const useCase = new UpdateDocumentUseCase(repository, indexCatalog);

    const updated = await useCase.execute({ id: 'foo-bar', title: 'Foo Bar Renamed' });

    expect(updated.title.value).toBe('Foo Bar Renamed');
    expect(updated.content).toBe('original content');
    expect([...updated.frontmatter.tags]).toEqual(['original']);
  });

  it('throws DocumentNotFoundError when no document matches the id', async () => {
    const repository = new FakeDocumentRepository();
    const indexCatalog = new FakeIndexCatalog();
    const useCase = new UpdateDocumentUseCase(repository, indexCatalog);

    await expect(useCase.execute({ id: 'missing', title: 'whatever' })).rejects.toBeInstanceOf(DocumentNotFoundError);
  });

  it('rejects an empty title and does not mutate state', async () => {
    const repository = new FakeDocumentRepository();
    const indexCatalog = new FakeIndexCatalog();
    await seedDocument(repository, indexCatalog);
    const useCase = new UpdateDocumentUseCase(repository, indexCatalog);

    await expect(useCase.execute({ id: 'foo-bar', title: '   ' })).rejects.toThrow('Title must not be empty');
    const reloaded = await repository.findById('foo-bar');
    expect(reloaded?.title.value).toBe('Foo Bar');
  });

  it('updates the status while preserving other fields', async () => {
    const repository = new FakeDocumentRepository();
    const indexCatalog = new FakeIndexCatalog();
    await seedDocument(repository, indexCatalog, { tags: ['t1'] });
    const useCase = new UpdateDocumentUseCase(repository, indexCatalog);

    const updated = await useCase.execute({ id: 'foo-bar', status: 'review' });

    expect(updated.metadata.status.value).toBe('review');
    expect(updated.title.value).toBe('Foo Bar');
    expect(updated.content).toBe('old content');
    expect([...updated.frontmatter.tags]).toEqual(['t1']);
    const reloaded = await repository.findById('foo-bar');
    expect(reloaded?.metadata.status.value).toBe('review');
  });

  it('updates the domain while preserving other fields', async () => {
    const repository = new FakeDocumentRepository();
    const indexCatalog = new FakeIndexCatalog();
    await seedDocument(repository, indexCatalog);
    const useCase = new UpdateDocumentUseCase(repository, indexCatalog);

    const updated = await useCase.execute({ id: 'foo-bar', domain: 'tech-stack' });

    expect(updated.metadata.domain?.value).toBe('tech-stack');
    expect(updated.title.value).toBe('Foo Bar');
    expect(updated.content).toBe('old content');
    const reloaded = await repository.findById('foo-bar');
    expect(reloaded?.metadata.domain?.value).toBe('tech-stack');
  });

  it('clears the domain when null is passed', async () => {
    const repository = new FakeDocumentRepository();
    const indexCatalog = new FakeIndexCatalog();
    const title = Title.create('Foo Bar');
    await repository.save(
      WikiDocument.create({
        title,
        content: 'old content',
        metadata: DocumentMetadata.from({
          tags: ['old-tag'],
          domain: 'tech-stack',
        }),
      }),
    );
    await indexCatalog.upsert(
      IndexEntry.create({ title: title.value, summary: 'old summary' }),
    );
    const useCase = new UpdateDocumentUseCase(repository, indexCatalog);

    const updated = await useCase.execute({ id: 'foo-bar', domain: null });

    expect(updated.metadata.domain).toBeNull();
    const reloaded = await repository.findById('foo-bar');
    expect(reloaded?.metadata.domain).toBeNull();
  });

  it('rejects an invalid status value and does not mutate state', async () => {
    const repository = new FakeDocumentRepository();
    const indexCatalog = new FakeIndexCatalog();
    await seedDocument(repository, indexCatalog);
    const useCase = new UpdateDocumentUseCase(repository, indexCatalog);

    await expect(
      useCase.execute({ id: 'foo-bar', status: 'invalid-status' }),
    ).rejects.toThrow(/Invalid status/);
    const reloaded = await repository.findById('foo-bar');
    expect(reloaded?.metadata.status.value).toBe('draft');
  });

  it('rejects an invalid domain value and does not mutate state', async () => {
    const repository = new FakeDocumentRepository();
    const indexCatalog = new FakeIndexCatalog();
    await seedDocument(repository, indexCatalog);
    const useCase = new UpdateDocumentUseCase(repository, indexCatalog);

    await expect(
      useCase.execute({ id: 'foo-bar', domain: 'NotKebab' }),
    ).rejects.toThrow(/Invalid domain/);
    const reloaded = await repository.findById('foo-bar');
    expect(reloaded?.metadata.domain).toBeNull();
  });

  describe('link validation', () => {
    it('re-validates links via the linkValidator on update when content changes', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      await repository.save(
        WikiDocument.create({
          title: Title.create('Existing Page'),
          content: 'body',
        }),
      );
      await seedDocument(repository, indexCatalog);
      const linkValidator = new ValidateLinksUseCase(repository);
      const useCase = new UpdateDocumentUseCase(repository, indexCatalog, linkValidator);

      const updated = await useCase.execute({
        id: 'foo-bar',
        content: 'See [[existing-page]] and [[missing]].',
      });

      expect([...updated.links.outbound]).toEqual(['existing-page', 'missing']);
      expect([...updated.links.broken]).toEqual(['missing']);
    });

    it('still updates the document when broken links are detected', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      await seedDocument(repository, indexCatalog);
      const linkValidator = new ValidateLinksUseCase(repository);
      const useCase = new UpdateDocumentUseCase(repository, indexCatalog, linkValidator);

      const updated = await useCase.execute({
        id: 'foo-bar',
        content: 'Reference [[does-not-exist]].',
      });

      expect(updated.content).toBe('Reference [[does-not-exist]].');
      expect([...updated.links.broken]).toEqual(['does-not-exist']);
    });

    it('keeps existing links when no linkValidator is configured', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      const title = Title.create('Foo Bar');
      await repository.save(
        WikiDocument.create({
          title,
          content: 'body',
          links: DocumentLinks.from({ outbound: ['kept'], broken: [] }),
        }),
      );
      await indexCatalog.upsert(
        IndexEntry.create({ title: title.value, summary: 'old summary' }),
      );
      const useCase = new UpdateDocumentUseCase(repository, indexCatalog);

      const updated = await useCase.execute({
        id: 'foo-bar',
        content: 'changed body',
      });

      expect([...updated.links.outbound]).toEqual(['kept']);
      expect([...updated.links.broken]).toEqual([]);
    });

    it('does not invoke the linkValidator when content is not changed', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      const title = Title.create('Foo Bar');
      await repository.save(
        WikiDocument.create({
          title,
          content: 'body with [[some-page]]',
          links: DocumentLinks.from({ outbound: ['some-page'], broken: [] }),
        }),
      );
      await indexCatalog.upsert(
        IndexEntry.create({ title: title.value, summary: 'old summary' }),
      );
      const linkValidator = new ValidateLinksUseCase(repository);
      const executeSpy = vi.spyOn(linkValidator, 'execute');
      const useCase = new UpdateDocumentUseCase(
        repository,
        indexCatalog,
        linkValidator,
      );

      const updated = await useCase.execute({
        id: 'foo-bar',
        tags: ['only-tags-changed'],
      });

      expect(executeSpy).not.toHaveBeenCalled();
      expect([...updated.links.outbound]).toEqual(['some-page']);
      expect([...updated.links.broken]).toEqual([]);
      expect([...updated.frontmatter.tags]).toEqual(['only-tags-changed']);
    });

    it('does not invoke the linkValidator when only the title changes', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      const title = Title.create('Foo Bar');
      await repository.save(
        WikiDocument.create({
          title,
          content: 'body',
          links: DocumentLinks.from({ outbound: ['kept'], broken: [] }),
        }),
      );
      await indexCatalog.upsert(
        IndexEntry.create({ title: title.value, summary: 'old summary' }),
      );
      const linkValidator = new ValidateLinksUseCase(repository);
      const executeSpy = vi.spyOn(linkValidator, 'execute');
      const useCase = new UpdateDocumentUseCase(
        repository,
        indexCatalog,
        linkValidator,
      );

      const updated = await useCase.execute({
        id: 'foo-bar',
        title: 'Foo Baz',
      });

      expect(executeSpy).not.toHaveBeenCalled();
      expect([...updated.links.outbound]).toEqual(['kept']);
    });
  });

  describe('link suggestion integration', () => {
    it('applies link suggestions to new content before persisting', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      await repository.save(
        WikiDocument.create({
          title: Title.create('Existing Page'),
          content: 'body',
        }),
      );
      await seedDocument(repository, indexCatalog);
      const linkSuggester = new SuggestLinksUseCase(repository);
      const useCase = new UpdateDocumentUseCase(
        repository,
        indexCatalog,
        undefined,
        linkSuggester,
      );

      const updated = await useCase.execute({
        id: 'foo-bar',
        content: 'See Existing Page for details.',
      });

      expect(updated.content).toBe('See [[existing-page]] for details.');
    });

    it('runs link suggestion before validation so suggested links are validated', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      await repository.save(
        WikiDocument.create({
          title: Title.create('Existing Page'),
          content: 'body',
        }),
      );
      await seedDocument(repository, indexCatalog);
      const linkSuggester = new SuggestLinksUseCase(repository);
      const linkValidator = new ValidateLinksUseCase(repository);
      const useCase = new UpdateDocumentUseCase(
        repository,
        indexCatalog,
        linkValidator,
        linkSuggester,
      );

      const updated = await useCase.execute({
        id: 'foo-bar',
        content: 'See Existing Page for details.',
      });

      expect(updated.content).toBe('See [[existing-page]] for details.');
      expect([...updated.links.outbound]).toEqual(['existing-page']);
      expect([...updated.links.broken]).toEqual([]);
    });

    it('does not invoke the linkSuggester when content is not changed', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      await seedDocument(repository, indexCatalog);
      const linkSuggester = new SuggestLinksUseCase(repository);
      const executeSpy = vi.spyOn(linkSuggester, 'execute');
      const useCase = new UpdateDocumentUseCase(
        repository,
        indexCatalog,
        undefined,
        linkSuggester,
      );

      const updated = await useCase.execute({
        id: 'foo-bar',
        tags: ['only-tags-changed'],
      });

      expect(executeSpy).not.toHaveBeenCalled();
      expect(updated.content).toBe('old content');
    });

    it('does not suggest a link to the document itself when title appears in new content', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      await seedDocument(repository, indexCatalog, { title: 'Self Page' });
      const linkSuggester = new SuggestLinksUseCase(repository);
      const useCase = new UpdateDocumentUseCase(
        repository,
        indexCatalog,
        undefined,
        linkSuggester,
      );

      const updated = await useCase.execute({
        id: 'self-page',
        content: 'I am Self Page writing about myself.',
      });

      expect(updated.content).toBe('I am Self Page writing about myself.');
    });

    it('still updates the document when link suggestion throws', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      await seedDocument(repository, indexCatalog);
      const failingSuggester = {
        async execute(): Promise<{ content: string; linksAdded: number }> {
          throw new Error('suggester exploded');
        },
      } as unknown as SuggestLinksUseCase;
      const useCase = new UpdateDocumentUseCase(
        repository,
        indexCatalog,
        undefined,
        failingSuggester,
      );

      const updated = await useCase.execute({
        id: 'foo-bar',
        content: 'See Existing Page for details.',
      });

      expect(updated.content).toBe('See Existing Page for details.');
    });

    it('leaves new content untouched when no linkSuggester is configured', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      await repository.save(
        WikiDocument.create({
          title: Title.create('Existing Page'),
          content: 'body',
        }),
      );
      await seedDocument(repository, indexCatalog);
      const useCase = new UpdateDocumentUseCase(repository, indexCatalog);

      const updated = await useCase.execute({
        id: 'foo-bar',
        content: 'See Existing Page for details.',
      });

      expect(updated.content).toBe('See Existing Page for details.');
    });
  });

  describe('conflict re-detection', () => {
    const sharedTags = ['t1', 't2', 't3', 't4', 't5'];

    it('marks updated document with conflictWith when tag overlap reaches 5 after update', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      const conflictDetector = new DetectConflictsUseCase();
      await repository.save(
        WikiDocument.create({
          title: Title.create('Existing'),
          content: 'body',
          metadata: DocumentMetadata.from({ tags: sharedTags }),
        }),
      );
      await seedDocument(repository, indexCatalog, { tags: ['initial'] });
      const useCase = new UpdateDocumentUseCase(
        repository,
        indexCatalog,
        undefined,
        undefined,
        conflictDetector,
      );

      const updated = await useCase.execute({
        id: 'foo-bar',
        tags: sharedTags,
      });

      expect(updated.metadata.conflict).toBe(true);
      expect([...updated.metadata.conflictWith]).toEqual(['existing']);
      const existing = await repository.findById('existing');
      expect(existing?.metadata.conflict).toBe(true);
      expect([...(existing?.metadata.conflictWith ?? [])]).toEqual(['foo-bar']);
    });

    it('clears stale conflict when an update removes the conflicting condition', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      const conflictDetector = new DetectConflictsUseCase();
      await repository.save(
        WikiDocument.create({
          title: Title.create('Existing'),
          content: 'body',
          metadata: DocumentMetadata.from({
            tags: sharedTags,
            conflict: true,
            conflictWith: ['foo-bar'],
          }),
        }),
      );
      await repository.save(
        WikiDocument.create({
          title: Title.create('Foo Bar'),
          content: 'body',
          metadata: DocumentMetadata.from({
            tags: sharedTags,
            conflict: true,
            conflictWith: ['existing'],
          }),
        }),
      );
      await indexCatalog.upsert(
        IndexEntry.create({ title: 'Foo Bar', summary: 'old summary' }),
      );
      const useCase = new UpdateDocumentUseCase(
        repository,
        indexCatalog,
        undefined,
        undefined,
        conflictDetector,
      );

      const updated = await useCase.execute({
        id: 'foo-bar',
        tags: ['solo'],
      });

      expect(updated.metadata.conflict).toBe(false);
      expect([...updated.metadata.conflictWith]).toEqual([]);
      const existing = await repository.findById('existing');
      expect(existing?.metadata.conflict).toBe(false);
      expect([...(existing?.metadata.conflictWith ?? [])]).toEqual([]);
    });

    it('cleans up old slug references when title changes (slug rename)', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      const conflictDetector = new DetectConflictsUseCase();
      await repository.save(
        WikiDocument.create({
          title: Title.create('Existing'),
          content: 'body',
          metadata: DocumentMetadata.from({
            tags: sharedTags,
            conflict: true,
            conflictWith: ['foo-bar'],
          }),
        }),
      );
      await repository.save(
        WikiDocument.create({
          title: Title.create('Foo Bar'),
          content: 'body',
          metadata: DocumentMetadata.from({
            tags: sharedTags,
            conflict: true,
            conflictWith: ['existing'],
          }),
        }),
      );
      await indexCatalog.upsert(
        IndexEntry.create({ title: 'Foo Bar', summary: 'old summary' }),
      );
      const useCase = new UpdateDocumentUseCase(
        repository,
        indexCatalog,
        undefined,
        undefined,
        conflictDetector,
      );

      const updated = await useCase.execute({
        id: 'foo-bar',
        title: 'Renamed Doc',
      });

      expect(updated.title.value).toBe('Renamed Doc');
      expect([...updated.metadata.conflictWith]).toEqual(['existing']);
      const existing = await repository.findById('existing');
      expect([...(existing?.metadata.conflictWith ?? [])]).toEqual(['renamed-doc']);
      expect(await repository.findById('foo-bar')).toBeNull();
    });

    it('skips conflict detection when no detector is provided', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      await repository.save(
        WikiDocument.create({
          title: Title.create('Existing'),
          content: 'body',
          metadata: DocumentMetadata.from({ tags: sharedTags }),
        }),
      );
      await seedDocument(repository, indexCatalog, { tags: ['initial'] });
      const useCase = new UpdateDocumentUseCase(repository, indexCatalog);

      const updated = await useCase.execute({
        id: 'foo-bar',
        tags: sharedTags,
      });

      expect(updated.metadata.conflict).toBe(false);
      expect([...updated.metadata.conflictWith]).toEqual([]);
      const existing = await repository.findById('existing');
      expect(existing?.metadata.conflict).toBe(false);
      expect([...(existing?.metadata.conflictWith ?? [])]).toEqual([]);
    });

    it('is idempotent across repeated identical updates', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      const conflictDetector = new DetectConflictsUseCase();
      await repository.save(
        WikiDocument.create({
          title: Title.create('Existing'),
          content: 'body',
          metadata: DocumentMetadata.from({ tags: sharedTags }),
        }),
      );
      await seedDocument(repository, indexCatalog);
      const useCase = new UpdateDocumentUseCase(
        repository,
        indexCatalog,
        undefined,
        undefined,
        conflictDetector,
      );

      await useCase.execute({ id: 'foo-bar', tags: sharedTags });
      const second = await useCase.execute({ id: 'foo-bar', tags: sharedTags });

      expect([...second.metadata.conflictWith]).toEqual(['existing']);
      const existing = await repository.findById('existing');
      expect([...(existing?.metadata.conflictWith ?? [])]).toEqual(['foo-bar']);
    });
  });

  describe('hierarchy', () => {
    it('updates parentSlug when provided', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      await repository.save(
        WikiDocument.create({
          title: Title.create('Parent'),
          content: 'parent',
        }),
      );
      await seedDocument(repository, indexCatalog);
      const useCase = new UpdateDocumentUseCase(repository, indexCatalog);

      const updated = await useCase.execute({
        id: 'foo-bar',
        parentSlug: 'parent',
      });

      expect(updated.parentSlug).toBe('parent');
      const reloaded = await repository.findById('foo-bar');
      expect(reloaded?.parentSlug).toBe('parent');
    });

    it('clears parentSlug when null is passed', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      const title = Title.create('Foo Bar');
      await repository.save(
        WikiDocument.create({
          title,
          content: 'body',
          parentSlug: 'old-parent',
        }),
      );
      await indexCatalog.upsert(
        IndexEntry.create({ title: title.value, summary: 'old summary' }),
      );
      const useCase = new UpdateDocumentUseCase(repository, indexCatalog);

      const updated = await useCase.execute({ id: 'foo-bar', parentSlug: null });

      expect(updated.parentSlug).toBeNull();
      const reloaded = await repository.findById('foo-bar');
      expect(reloaded?.parentSlug).toBeNull();
    });

    it('preserves parentSlug when not in input', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      const title = Title.create('Foo Bar');
      await repository.save(
        WikiDocument.create({
          title,
          content: 'body',
          parentSlug: 'kept-parent',
        }),
      );
      await indexCatalog.upsert(
        IndexEntry.create({ title: title.value, summary: 'old summary' }),
      );
      const useCase = new UpdateDocumentUseCase(repository, indexCatalog);

      const updated = await useCase.execute({ id: 'foo-bar', tags: ['t1'] });

      expect(updated.parentSlug).toBe('kept-parent');
      const reloaded = await repository.findById('foo-bar');
      expect(reloaded?.parentSlug).toBe('kept-parent');
    });

    it('rejects when update would create a self-cycle', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      await seedDocument(repository, indexCatalog);
      const useCase = new UpdateDocumentUseCase(repository, indexCatalog);

      await expect(
        useCase.execute({ id: 'foo-bar', parentSlug: 'foo-bar' }),
      ).rejects.toThrow(/Circular hierarchy/);
    });

    it('rejects when update would create a 2-cycle (A.parent=B, update B.parent=A)', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      await repository.save(
        WikiDocument.create({
          title: Title.create('A'),
          content: 'body',
          parentSlug: 'b',
        }),
      );
      await repository.save(
        WikiDocument.create({
          title: Title.create('B'),
          content: 'body',
        }),
      );
      await indexCatalog.upsert(IndexEntry.create({ title: 'B', summary: 's' }));
      const useCase = new UpdateDocumentUseCase(repository, indexCatalog);

      await expect(
        useCase.execute({ id: 'b', parentSlug: 'a' }),
      ).rejects.toThrow(/Circular hierarchy/);
    });

    it('rejects when update would create a 3-cycle', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      await repository.save(
        WikiDocument.create({
          title: Title.create('A'),
          content: 'body',
          parentSlug: 'c',
        }),
      );
      await repository.save(
        WikiDocument.create({
          title: Title.create('B'),
          content: 'body',
          parentSlug: 'a',
        }),
      );
      await repository.save(
        WikiDocument.create({
          title: Title.create('C'),
          content: 'body',
        }),
      );
      await indexCatalog.upsert(IndexEntry.create({ title: 'C', summary: 's' }));
      const useCase = new UpdateDocumentUseCase(repository, indexCatalog);

      await expect(
        useCase.execute({ id: 'c', parentSlug: 'b' }),
      ).rejects.toThrow(/Circular hierarchy/);
    });

    it('reparents children when slug changes via title rename', async () => {
      const repository = new FakeDocumentRepository();
      const indexCatalog = new FakeIndexCatalog();
      await repository.save(
        WikiDocument.create({
          title: Title.create('Old Parent'),
          content: 'body',
        }),
      );
      await indexCatalog.upsert(
        IndexEntry.create({ title: 'Old Parent', summary: 's' }),
      );
      await repository.save(
        WikiDocument.create({
          title: Title.create('Child One'),
          content: 'body',
          parentSlug: 'old-parent',
        }),
      );
      await repository.save(
        WikiDocument.create({
          title: Title.create('Child Two'),
          content: 'body',
          parentSlug: 'old-parent',
        }),
      );
      const useCase = new UpdateDocumentUseCase(repository, indexCatalog);

      await useCase.execute({ id: 'old-parent', title: 'New Parent' });

      const childOne = await repository.findById('child-one');
      const childTwo = await repository.findById('child-two');
      expect(childOne?.parentSlug).toBe('new-parent');
      expect(childTwo?.parentSlug).toBe('new-parent');
    });
  });
});
