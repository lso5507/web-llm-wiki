import { describe, expect, it, vi } from 'vitest';

import type { DocumentRepository } from '../../../src/application/ports/document-repository.js';
import type { QuestionAnswerer } from '../../../src/application/ports/question-answerer.js';
import { AskAIUseCase, EmptyQuestionError } from '../../../src/application/use-cases/ask-ai.js';
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

const buildDocument = (params: { title: string; content?: string; tags?: string[] }): WikiDocument =>
  WikiDocument.create({
    title: Title.create(params.title),
    content: params.content ?? '',
    metadata: DocumentMetadata.from({ tags: params.tags ?? [] }),
  });

const stubAnswerer = (answer: string | Error): QuestionAnswerer => ({
  answer: vi.fn(() =>
    answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer),
  ),
});

describe('AskAIUseCase', () => {
  describe('input validation', () => {
    it('throws EmptyQuestionError when the question is an empty string', async () => {
      const repository = new FakeDocumentRepository();
      const answerer = stubAnswerer('답변');
      const useCase = new AskAIUseCase(repository, answerer);

      await expect(useCase.execute({ question: '' })).rejects.toBeInstanceOf(EmptyQuestionError);
    });

    it('throws EmptyQuestionError when the question is whitespace only', async () => {
      const repository = new FakeDocumentRepository();
      const answerer = stubAnswerer('답변');
      const useCase = new AskAIUseCase(repository, answerer);

      await expect(useCase.execute({ question: '   \n\t  ' })).rejects.toBeInstanceOf(
        EmptyQuestionError,
      );
    });
  });

  describe('keyword search (BM25-lite)', () => {
    it('returns the answer with sources when documents match the question keywords', async () => {
      const repository = new FakeDocumentRepository();
      await repository.save(
        buildDocument({ title: 'TypeScript Guide', content: 'TypeScript is a typed superset' }),
      );
      const answerer = stubAnswerer('타입스크립트는 정적 타입 언어입니다.');
      const useCase = new AskAIUseCase(repository, answerer);

      const result = await useCase.execute({ question: 'TypeScript가 뭐야?' });

      expect(result.answer).toBe('타입스크립트는 정적 타입 언어입니다.');
      expect(result.sources).toEqual([{ id: 'typescript-guide', title: 'TypeScript Guide' }]);
    });

    it('ranks documents by keyword frequency and selects the top 3', async () => {
      const repository = new FakeDocumentRepository();
      await repository.save(
        buildDocument({
          title: 'React Hooks',
          content: 'react react react hooks hooks state effect',
        }),
      );
      await repository.save(
        buildDocument({
          title: 'React Routing',
          content: 'react routing navigation',
        }),
      );
      await repository.save(
        buildDocument({
          title: 'Vue Guide',
          content: 'vue components',
        }),
      );
      await repository.save(
        buildDocument({
          title: 'Angular Notes',
          content: 'angular components services',
        }),
      );
      await repository.save(
        buildDocument({
          title: 'React Server Components',
          content: 'react server components rendering',
        }),
      );
      const answerer = stubAnswerer('답변');
      const useCase = new AskAIUseCase(repository, answerer);

      const result = await useCase.execute({ question: 'react hooks' });

      expect(result.sources).toHaveLength(3);
      // The most relevant doc (highest keyword match) must come first.
      expect(result.sources[0]).toEqual({ id: 'react-hooks', title: 'React Hooks' });
      const ids = result.sources.map((source) => source.id);
      expect(ids).toContain('react-routing');
      expect(ids).toContain('react-server-components');
      expect(ids).not.toContain('vue-guide');
      expect(ids).not.toContain('angular-notes');
    });

    it('matches keywords case-insensitively', async () => {
      const repository = new FakeDocumentRepository();
      await repository.save(
        buildDocument({ title: 'TypeScript Guide', content: 'TYPESCRIPT details' }),
      );
      const answerer = stubAnswerer('답변');
      const useCase = new AskAIUseCase(repository, answerer);

      const result = await useCase.execute({ question: 'typescript' });

      expect(result.sources).toEqual([{ id: 'typescript-guide', title: 'TypeScript Guide' }]);
    });

    it('searches both title and content', async () => {
      const repository = new FakeDocumentRepository();
      await repository.save(buildDocument({ title: 'Hexagonal', content: 'unrelated body' }));
      await repository.save(buildDocument({ title: 'Other', content: 'mentions hexagonal here' }));
      const answerer = stubAnswerer('답변');
      const useCase = new AskAIUseCase(repository, answerer);

      const result = await useCase.execute({ question: 'hexagonal' });

      const ids = result.sources.map((source) => source.id).sort();
      expect(ids).toEqual(['hexagonal', 'other']);
    });

    it('ignores documents with zero keyword matches', async () => {
      const repository = new FakeDocumentRepository();
      await repository.save(buildDocument({ title: 'React', content: 'react body' }));
      await repository.save(buildDocument({ title: 'Vue', content: 'vue body' }));
      const answerer = stubAnswerer('답변');
      const useCase = new AskAIUseCase(repository, answerer);

      const result = await useCase.execute({ question: 'react' });

      expect(result.sources).toEqual([{ id: 'react', title: 'React' }]);
    });
  });

  describe('answer composition', () => {
    it('passes the question and matched documents to the QuestionAnswerer', async () => {
      const repository = new FakeDocumentRepository();
      await repository.save(buildDocument({ title: 'A', content: 'react alpha' }));
      await repository.save(buildDocument({ title: 'B', content: 'react beta' }));
      const answerer = stubAnswerer('답변');
      const useCase = new AskAIUseCase(repository, answerer);

      await useCase.execute({ question: 'react' });

      expect(answerer.answer).toHaveBeenCalledTimes(1);
      const [question, context] = (answerer.answer as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(question).toBe('react');
      expect(context).toHaveLength(2);
      // Each context entry must include the title and the content.
      const joined = (context as string[]).join('\n');
      expect(joined).toContain('A');
      expect(joined).toContain('react alpha');
      expect(joined).toContain('B');
      expect(joined).toContain('react beta');
    });

    it('returns answer with empty sources when no documents match', async () => {
      const repository = new FakeDocumentRepository();
      await repository.save(buildDocument({ title: 'Vue', content: 'vue body' }));
      const answerer = stubAnswerer('문서에서 찾을 수 없습니다');
      const useCase = new AskAIUseCase(repository, answerer);

      const result = await useCase.execute({ question: 'kubernetes' });

      expect(result.answer).toBe('문서에서 찾을 수 없습니다');
      expect(result.sources).toEqual([]);
    });

    it('still calls the answerer with empty context when no documents match', async () => {
      const repository = new FakeDocumentRepository();
      const answerer = stubAnswerer('답변');
      const useCase = new AskAIUseCase(repository, answerer);

      await useCase.execute({ question: 'anything' });

      expect(answerer.answer).toHaveBeenCalledTimes(1);
      const [, context] = (answerer.answer as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(context).toEqual([]);
    });

    it('propagates errors from the QuestionAnswerer', async () => {
      const repository = new FakeDocumentRepository();
      await repository.save(buildDocument({ title: 'A', content: 'react body' }));
      const answerer = stubAnswerer(new Error('LLM down'));
      const useCase = new AskAIUseCase(repository, answerer);

      await expect(useCase.execute({ question: 'react' })).rejects.toThrow('LLM down');
    });

    it('trims the question before searching and forwarding to the answerer', async () => {
      const repository = new FakeDocumentRepository();
      await repository.save(buildDocument({ title: 'React', content: 'react body' }));
      const answerer = stubAnswerer('답변');
      const useCase = new AskAIUseCase(repository, answerer);

      await useCase.execute({ question: '   react   ' });

      const [question] = (answerer.answer as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(question).toBe('react');
    });
  });
});
