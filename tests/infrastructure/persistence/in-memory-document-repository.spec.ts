import { describe, expect, it } from 'vitest';

import { InMemoryDocumentRepository } from '../../../src/infrastructure/persistence/in-memory/in-memory-document-repository.js';
import { WikiDocument } from '../../../src/domain/wiki/document.js';
import { Frontmatter } from '../../../src/domain/wiki/frontmatter.js';
import { Title } from '../../../src/domain/wiki/title.js';

describe('InMemoryDocumentRepository', () => {
  it('saves and overwrites by title slug', async () => {
    const repository = new InMemoryDocumentRepository();

    await repository.save(
      WikiDocument.create({ title: Title.create('Foo'), frontmatter: Frontmatter.create({}), content: 'old' }),
    );
    await repository.save(
      WikiDocument.create({ title: Title.create('Foo'), frontmatter: Frontmatter.create({}), content: 'new' }),
    );

    expect((await repository.findByTitle(Title.create('Foo')))?.content).toBe('new');
  });

  describe('findById', () => {
    it('returns the document matching the id (slug)', async () => {
      const repository = new InMemoryDocumentRepository();
      await repository.save(
        WikiDocument.create({
          title: Title.create('Orenz Test Account'),
          frontmatter: Frontmatter.create({}),
          content: 'body',
        }),
      );

      const found = await repository.findById('orenz-test-account');

      expect(found).not.toBeNull();
      expect(found?.title.value).toBe('Orenz Test Account');
      expect(found?.content).toBe('body');
    });

    it('returns null when no document matches the id', async () => {
      const repository = new InMemoryDocumentRepository();

      expect(await repository.findById('missing-doc')).toBeNull();
    });
  });

  describe('delete', () => {
    it('removes the document so subsequent lookups return null', async () => {
      const repository = new InMemoryDocumentRepository();
      await repository.save(
        WikiDocument.create({
          title: Title.create('Foo Bar'),
          frontmatter: Frontmatter.create({}),
          content: 'body',
        }),
      );

      await repository.delete('foo-bar');

      expect(await repository.findById('foo-bar')).toBeNull();
      expect(await repository.findByTitle(Title.create('Foo Bar'))).toBeNull();
    });

    it('is idempotent when deleting a non-existent id', async () => {
      const repository = new InMemoryDocumentRepository();

      await expect(repository.delete('never-existed')).resolves.toBeUndefined();
    });

    it('frees up storage so the limit allows new documents', async () => {
      const repository = new InMemoryDocumentRepository({ maxStoredDocuments: 1 });
      await repository.save(
        WikiDocument.create({
          title: Title.create('First'),
          frontmatter: Frontmatter.create({}),
          content: 'a',
        }),
      );

      await repository.delete('first');

      await expect(
        repository.save(
          WikiDocument.create({
            title: Title.create('Second'),
            frontmatter: Frontmatter.create({}),
            content: 'b',
          }),
        ),
      ).resolves.toBeUndefined();
    });
  });

  describe('exists', () => {
    it('returns true when a document is stored under the given slug', async () => {
      const repository = new InMemoryDocumentRepository();
      await repository.save(
        WikiDocument.create({
          title: Title.create('Foo Bar'),
          frontmatter: Frontmatter.create({}),
          content: 'body',
        }),
      );

      expect(await repository.exists('foo-bar')).toBe(true);
    });

    it('returns false when no document is stored under the given slug', async () => {
      const repository = new InMemoryDocumentRepository();

      expect(await repository.exists('missing')).toBe(false);
    });

    it('returns false after the document is deleted', async () => {
      const repository = new InMemoryDocumentRepository();
      await repository.save(
        WikiDocument.create({
          title: Title.create('Foo Bar'),
          frontmatter: Frontmatter.create({}),
          content: 'body',
        }),
      );

      await repository.delete('foo-bar');

      expect(await repository.exists('foo-bar')).toBe(false);
    });
  });
});
