import { describe, expect, it, vi } from 'vitest';

import type { DocumentRepository } from '../../../src/application/ports/document-repository.js';
import type { QuestionAnswerer } from '../../../src/application/ports/question-answerer.js';
import type { EmbeddingGenerator } from '../../../src/application/ports/embedding-generator.js';
import { AskAIUseCase, EmptyQuestionError } from '../../../src/application/use-cases/ask-ai.js';
import { SemanticIndexSearcher } from '../../../src/application/services/semantic-index-searcher.js';
import { DocumentMetadata } from '../../../src/domain/wiki/document-metadata.js';
import { IndexEntry } from '../../../src/domain/wiki/index-entry.js';
import { Title } from '../../../src/domain/wiki/title.js';
import { WikiDocument } from '../../../src/domain/wiki/document.js';
import { InMemoryEmbeddingStore } from '../../../src/infrastructure/persistence/in-memory/in-memory-embedding-store.js';
import { InMemoryIndexCatalog } from '../../../src/infrastructure/persistence/in-memory/in-memory-index-catalog.js';

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

const buildDocumentWithConflicts = (params: {
  title: string;
  content?: string;
  semanticConflicts: Array<{
    conflictingDocumentSlug: string;
    conflictingDocumentTitle: string;
    explanation: string;
    confidence: 'high' | 'medium' | 'low';
  }>;
}): WikiDocument =>
  WikiDocument.create({
    title: Title.create(params.title),
    content: params.content ?? '',
    metadata: DocumentMetadata.from({ semanticConflicts: params.semanticConflicts }),
  });

const stubAnswerer = (answer: string | Error): QuestionAnswerer => ({
  answer: vi.fn(() =>
    answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer),
  ),
});

const buildEmbeddingGenerator = (): EmbeddingGenerator => ({
  modelId: 'fake-e5',
  dimensions: 2,
  embed: vi.fn(async (text: string) => (text.includes('배포') ? [1, 0] : [0, 1])),
  embedBatch: vi.fn(async (texts: readonly string[]) =>
    texts.map((text) => (text.includes('서버 출시') ? [1, 0] : [0, 1])),
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
      expect(result.conflicts).toEqual([]);
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

  describe('index-first hybrid search', () => {
    it('uses a confident title and summary match without running the embedding model', async () => {
      const repository = new FakeDocumentRepository();
      await repository.save(buildDocument({ title: '배포 가이드', content: '운영 반영 절차' }));
      const indexCatalog = new InMemoryIndexCatalog();
      await indexCatalog.upsert(IndexEntry.create({ title: '배포 가이드', summary: '운영 배포 절차' }));
      const embeddings = buildEmbeddingGenerator();
      const store = new InMemoryEmbeddingStore();
      const useCase = new AskAIUseCase(
        repository,
        stubAnswerer('답변'),
        embeddings,
        new SemanticIndexSearcher(store),
        indexCatalog,
        store,
      );

      const result = await useCase.execute({ question: '배포 가이드' });

      expect(result.sources).toEqual([{ id: '배포-가이드', title: '배포 가이드' }]);
      expect(embeddings.embed).not.toHaveBeenCalled();
      expect(embeddings.embedBatch).not.toHaveBeenCalled();
    });

    it('falls back to semantic search and applies E5 query and passage prefixes', async () => {
      const repository = new FakeDocumentRepository();
      await repository.save(buildDocument({ title: '릴리스 절차', content: '서비스 공개 방법' }));
      await repository.save(buildDocument({ title: '간식 목록', content: '과자 정보' }));
      const indexCatalog = new InMemoryIndexCatalog();
      await indexCatalog.upsert(IndexEntry.create({ title: '릴리스 절차', summary: '서버 출시 과정' }));
      await indexCatalog.upsert(IndexEntry.create({ title: '간식 목록', summary: '먹을거리 종류' }));
      const embeddings = buildEmbeddingGenerator();
      const store = new InMemoryEmbeddingStore();
      const useCase = new AskAIUseCase(
        repository,
        stubAnswerer('답변'),
        embeddings,
        new SemanticIndexSearcher(store),
        indexCatalog,
        store,
      );

      const result = await useCase.execute({ question: '배포 방법을 알려줘' });

      expect(result.sources[0]).toEqual({ id: '릴리스-절차', title: '릴리스 절차' });
      expect(embeddings.embed).toHaveBeenCalledWith('query: 배포 방법을 알려줘');
      expect(embeddings.embedBatch).toHaveBeenCalledWith([
        'passage: 간식 목록\n먹을거리 종류',
        'passage: 릴리스 절차\n서버 출시 과정',
      ]);
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
      expect(result.conflicts).toEqual([]);
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

    it('returns a conflict warning template when matched documents conflict with each other', async () => {
      const repository = new FakeDocumentRepository();
      await repository.save(
        buildDocumentWithConflicts({
          title: '배송 정책 A',
          content: '배송비용은 3000원입니다. 국내 배송만 지원합니다.',
          semanticConflicts: [
            {
              conflictingDocumentSlug: '배송-정책-b',
              conflictingDocumentTitle: '배송 정책 B',
              explanation: '배송비와 지원 지역 정책이 상충됩니다.',
              confidence: 'high',
            },
          ],
        }),
      );
      await repository.save(
        buildDocumentWithConflicts({
          title: '배송 정책 B',
          content: '배송비용은 무료이며 해외 배송을 지원합니다.',
          semanticConflicts: [],
        }),
      );
      const answerer = stubAnswerer('일반 답변이 오면 안 됩니다.');
      const useCase = new AskAIUseCase(repository, answerer);

      const result = await useCase.execute({ question: '배송비용은 얼마인가요?' });

      expect(result.answer).toContain('충돌된 문서에 대한 지식입니다');
      expect(result.conflicts).toEqual([
        {
          left: { id: '배송-정책-a', title: '배송 정책 A' },
          right: { id: '배송-정책-b', title: '배송 정책 B' },
          explanation: '배송비와 지원 지역 정책이 상충됩니다.',
          confidence: 'high',
        },
      ]);
      expect(answerer.answer).not.toHaveBeenCalled();
    });

    it('does not emit conflict metadata when only one side of a conflict is in the matched set', async () => {
      const repository = new FakeDocumentRepository();
      await repository.save(
        buildDocumentWithConflicts({
          title: '배송 정책 A',
          content: '배송비용은 3000원입니다.',
          semanticConflicts: [
            {
              conflictingDocumentSlug: '배송-정책-b',
              conflictingDocumentTitle: '배송 정책 B',
              explanation: '배송비 정책이 상충됩니다.',
              confidence: 'high',
            },
          ],
        }),
      );
      await repository.save(
        buildDocument({ title: '결제 정책', content: '결제 수단은 카드입니다.' }),
      );
      const answerer = stubAnswerer('답변');
      const useCase = new AskAIUseCase(repository, answerer);

      const result = await useCase.execute({ question: '배송비용' });

      expect(result.conflicts).toEqual([]);
      expect(result.answer).toBe('답변');
      expect(answerer.answer).toHaveBeenCalledTimes(1);
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
