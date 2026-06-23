import { describe, expect, it } from 'vitest';

import type { DocumentRepository } from '../../../src/application/ports/document-repository.js';
import { SearchDocumentsUseCase } from '../../../src/application/use-cases/search-documents.js';
import { DocumentMetadata } from '../../../src/domain/wiki/document-metadata.js';
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

const buildDocument = (params: {
  title: string;
  content?: string;
  status?: string;
  domain?: string | null;
  tags?: string[];
}): WikiDocument =>
  WikiDocument.create({
    title: Title.create(params.title),
    content: params.content ?? '',
    metadata: DocumentMetadata.from({
      status: params.status,
      domain: params.domain,
      tags: params.tags ?? [],
    }),
  });

describe('SearchDocumentsUseCase', () => {
  describe('when no filters are provided', () => {
    it('returns all documents from the repository', async () => {
      const repository = new FakeDocumentRepository();
      await repository.save(buildDocument({ title: 'Alpha' }));
      await repository.save(buildDocument({ title: 'Beta' }));
      const useCase = new SearchDocumentsUseCase(repository);

      const result = await useCase.execute({});

      const titles = result.map((document) => document.title.value).sort();
      expect(titles).toEqual(['Alpha', 'Beta']);
    });

    it('returns an empty array when no documents exist', async () => {
      const repository = new FakeDocumentRepository();
      const useCase = new SearchDocumentsUseCase(repository);

      const result = await useCase.execute({});

      expect(result).toEqual([]);
    });
  });

  describe('query filter', () => {
    it('matches the query against the title (case-insensitive partial match)', async () => {
      const repository = new FakeDocumentRepository();
      await repository.save(buildDocument({ title: 'TypeScript Handbook' }));
      await repository.save(buildDocument({ title: 'Python Cookbook' }));
      const useCase = new SearchDocumentsUseCase(repository);

      const result = await useCase.execute({ query: 'typescript' });

      expect(result).toHaveLength(1);
      expect(result[0].title.value).toBe('TypeScript Handbook');
    });

    it('matches the query against the content (case-insensitive partial match)', async () => {
      const repository = new FakeDocumentRepository();
      await repository.save(
        buildDocument({ title: 'Doc A', content: 'Discusses Hexagonal Architecture in detail.' }),
      );
      await repository.save(
        buildDocument({ title: 'Doc B', content: 'Talks about REST APIs.' }),
      );
      const useCase = new SearchDocumentsUseCase(repository);

      const result = await useCase.execute({ query: 'hexagonal' });

      expect(result).toHaveLength(1);
      expect(result[0].title.value).toBe('Doc A');
    });

    it('matches when query appears in either title or content', async () => {
      const repository = new FakeDocumentRepository();
      await repository.save(buildDocument({ title: 'Foo', content: 'mentions widgets' }));
      await repository.save(buildDocument({ title: 'Widgets Guide', content: 'unrelated body' }));
      await repository.save(buildDocument({ title: 'Bar', content: 'no match here' }));
      const useCase = new SearchDocumentsUseCase(repository);

      const result = await useCase.execute({ query: 'WIDGETS' });

      const titles = result.map((document) => document.title.value).sort();
      expect(titles).toEqual(['Foo', 'Widgets Guide']);
    });

    it('returns an empty array when the query matches nothing', async () => {
      const repository = new FakeDocumentRepository();
      await repository.save(buildDocument({ title: 'Alpha', content: 'body' }));
      const useCase = new SearchDocumentsUseCase(repository);

      const result = await useCase.execute({ query: 'nonexistent' });

      expect(result).toEqual([]);
    });
  });

  describe('domain filter', () => {
    it('returns only documents whose domain matches exactly', async () => {
      const repository = new FakeDocumentRepository();
      await repository.save(buildDocument({ title: 'A', domain: 'tech-stack' }));
      await repository.save(buildDocument({ title: 'B', domain: 'product' }));
      await repository.save(buildDocument({ title: 'C', domain: 'tech-stack' }));
      const useCase = new SearchDocumentsUseCase(repository);

      const result = await useCase.execute({ domain: 'tech-stack' });

      const titles = result.map((document) => document.title.value).sort();
      expect(titles).toEqual(['A', 'C']);
    });

    it('excludes documents without a domain when domain filter is provided', async () => {
      const repository = new FakeDocumentRepository();
      await repository.save(buildDocument({ title: 'A', domain: 'tech-stack' }));
      await repository.save(buildDocument({ title: 'B' }));
      const useCase = new SearchDocumentsUseCase(repository);

      const result = await useCase.execute({ domain: 'tech-stack' });

      expect(result).toHaveLength(1);
      expect(result[0].title.value).toBe('A');
    });
  });

  describe('status filter', () => {
    it('returns only documents whose status matches exactly', async () => {
      const repository = new FakeDocumentRepository();
      await repository.save(buildDocument({ title: 'A', status: 'draft' }));
      await repository.save(buildDocument({ title: 'B', status: 'review' }));
      await repository.save(buildDocument({ title: 'C', status: 'published' }));
      const useCase = new SearchDocumentsUseCase(repository);

      const result = await useCase.execute({ status: 'review' });

      expect(result).toHaveLength(1);
      expect(result[0].title.value).toBe('B');
    });
  });

  describe('tags filter', () => {
    it('returns documents that contain ALL of the requested tags', async () => {
      const repository = new FakeDocumentRepository();
      await repository.save(buildDocument({ title: 'A', tags: ['react', 'frontend'] }));
      await repository.save(buildDocument({ title: 'B', tags: ['react'] }));
      await repository.save(buildDocument({ title: 'C', tags: ['frontend'] }));
      await repository.save(buildDocument({ title: 'D', tags: ['react', 'frontend', 'extra'] }));
      const useCase = new SearchDocumentsUseCase(repository);

      const result = await useCase.execute({ tags: ['react', 'frontend'] });

      const titles = result.map((document) => document.title.value).sort();
      expect(titles).toEqual(['A', 'D']);
    });

    it('returns all documents when tags array is empty', async () => {
      const repository = new FakeDocumentRepository();
      await repository.save(buildDocument({ title: 'A', tags: ['react'] }));
      await repository.save(buildDocument({ title: 'B', tags: [] }));
      const useCase = new SearchDocumentsUseCase(repository);

      const result = await useCase.execute({ tags: [] });

      const titles = result.map((document) => document.title.value).sort();
      expect(titles).toEqual(['A', 'B']);
    });

    it('returns an empty array when no document matches all required tags', async () => {
      const repository = new FakeDocumentRepository();
      await repository.save(buildDocument({ title: 'A', tags: ['react'] }));
      const useCase = new SearchDocumentsUseCase(repository);

      const result = await useCase.execute({ tags: ['react', 'angular'] });

      expect(result).toEqual([]);
    });
  });

  describe('combined filters (AND semantics)', () => {
    it('applies all provided filters together', async () => {
      const repository = new FakeDocumentRepository();
      await repository.save(
        buildDocument({
          title: 'React Hooks Guide',
          content: 'about hooks',
          status: 'published',
          domain: 'tech-stack',
          tags: ['react', 'frontend'],
        }),
      );
      await repository.save(
        buildDocument({
          title: 'React Routing Notes',
          content: 'about routing',
          status: 'draft',
          domain: 'tech-stack',
          tags: ['react', 'frontend'],
        }),
      );
      await repository.save(
        buildDocument({
          title: 'Vue Guide',
          content: 'vue hooks',
          status: 'published',
          domain: 'tech-stack',
          tags: ['vue', 'frontend'],
        }),
      );
      const useCase = new SearchDocumentsUseCase(repository);

      const result = await useCase.execute({
        query: 'react',
        domain: 'tech-stack',
        status: 'published',
        tags: ['frontend'],
      });

      expect(result).toHaveLength(1);
      expect(result[0].title.value).toBe('React Hooks Guide');
    });

    it('returns an empty array when one of the AND conditions fails', async () => {
      const repository = new FakeDocumentRepository();
      await repository.save(
        buildDocument({
          title: 'React Guide',
          status: 'published',
          domain: 'tech-stack',
          tags: ['react'],
        }),
      );
      const useCase = new SearchDocumentsUseCase(repository);

      const result = await useCase.execute({
        query: 'react',
        status: 'draft',
      });

      expect(result).toEqual([]);
    });
  });
});
