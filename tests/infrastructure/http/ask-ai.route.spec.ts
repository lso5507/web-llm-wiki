import { describe, expect, it } from 'vitest';

import type { QuestionAnswerer } from '../../../src/application/ports/question-answerer.js';
import { Domain } from '../../../src/domain/wiki/domain.js';
import { createApp } from '../../../src/infrastructure/config/composition-root.js';

const stubAnswerer = (answer: string | Error): QuestionAnswerer => ({
  async answer(): Promise<string> {
    if (answer instanceof Error) {
      throw answer;
    }
    return answer;
  },
});

const seedDocument = async (
  app: ReturnType<typeof createApp>,
  payload: { title: string; summary?: string; content?: string; tags?: string[] },
): Promise<void> => {
  const createResponse = await app.request('/documents', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: payload.title,
      summary: payload.summary ?? `summary for ${payload.title}`,
      content: payload.content,
      tags: payload.tags,
    }),
  });
  expect(createResponse.status).toBe(201);
};

describe('POST /ask', () => {
  describe('successful answers', () => {
    it('returns 200 with answer and sources when documents match the question', async () => {
      const app = createApp({
        openRouter: {
          questionAnswerer: stubAnswerer('TypeScript는 정적 타입 언어입니다.'),
        },
      });
      await seedDocument(app, { title: 'TypeScript Guide', content: 'TypeScript is a typed language' });

      const response = await app.request('/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: 'TypeScript가 뭐야?' }),
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        answer: string;
        sources: Array<{ id: string; title: string }>;
        conflicts: unknown[];
      };
      expect(body.answer).toBe('TypeScript는 정적 타입 언어입니다.');
      expect(body.sources).toEqual([{ id: 'typescript-guide', title: 'TypeScript Guide' }]);
      expect(body.conflicts).toEqual([]);
    });

    it('returns up to 3 sources sorted by keyword relevance', async () => {
      const app = createApp({
        openRouter: {
          questionAnswerer: stubAnswerer('답변'),
        },
      });
      await seedDocument(app, { title: 'React Hooks', content: 'react react hooks state' });
      await seedDocument(app, { title: 'React Routing', content: 'react routing' });
      await seedDocument(app, { title: 'React Server Components', content: 'react server' });
      await seedDocument(app, { title: 'Vue Guide', content: 'vue components' });

      const response = await app.request('/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: 'react hooks' }),
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        answer: string;
        sources: Array<{ id: string; title: string }>;
        conflicts: unknown[];
      };
      expect(body.sources).toHaveLength(3);
      expect(body.conflicts).toEqual([]);
      expect(body.sources[0]).toEqual({ id: 'react-hooks', title: 'React Hooks' });
      const ids = body.sources.map((source) => source.id);
      expect(ids).not.toContain('vue-guide');
    });

    it('returns 200 with empty sources when no documents match the question', async () => {
      const app = createApp({
        openRouter: {
          questionAnswerer: stubAnswerer('문서에서 찾을 수 없습니다.'),
        },
      });
      await seedDocument(app, { title: 'Vue Guide', content: 'vue body' });

      const response = await app.request('/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: 'kubernetes' }),
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as { answer: string; sources: unknown[]; conflicts: unknown[] };
      expect(body.answer).toBe('문서에서 찾을 수 없습니다.');
      expect(body.sources).toEqual([]);
      expect(body.conflicts).toEqual([]);
    });

    it('returns conflict metadata and a warning answer when matched sources conflict', async () => {
      const app = createApp({
        openRouter: {
          questionAnswerer: stubAnswerer('이 답변은 호출되면 안 됩니다.'),
          domainClassifier: {
            async classify() {
              return Domain.from('shipping');
            },
          },
          semanticConflictDetector: {
            async detectConflicts(targetDocument) {
              if (targetDocument.title.value !== '배송 정책 A') {
                return [];
              }

              return [
                {
                  conflictingDocumentSlug: '배송-정책-b',
                  conflictingDocumentTitle: '배송 정책 B',
                  explanation: '배송비와 배송 범위 정책이 상충됩니다.',
                  confidence: 'high',
                },
              ];
            },
          },
        },
      });

      const firstResponse = await app.request('/documents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: '배송 정책 A',
          summary: '배송비 3000원, 국내 배송만 지원',
          content: '배송비용은 3000원입니다. 국내 배송만 지원합니다.',
          forceSemanticConflicts: false,
        }),
      });
      expect(firstResponse.status).toBe(201);

      const secondResponse = await app.request('/documents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: '배송 정책 B',
          summary: '배송비 무료, 해외 배송 지원',
          content: '배송비용은 무료이며 해외 배송을 지원합니다.',
        }),
      });
      expect(secondResponse.status).toBe(201);

      const response = await app.request('/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: '배송비용은 얼마인가요?' }),
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        answer: string;
        sources: Array<{ id: string; title: string }>;
        conflicts: Array<{
          left: { id: string; title: string };
          right: { id: string; title: string };
          explanation: string;
          confidence: string;
        }>;
      };
      expect(body.answer).toContain('충돌된 문서에 대한 지식입니다');
      expect(body.conflicts).toEqual([
        {
          left: { id: '배송-정책-a', title: '배송 정책 A' },
          right: { id: '배송-정책-b', title: '배송 정책 B' },
          explanation: '배송비와 배송 범위 정책이 상충됩니다.',
          confidence: 'high',
        },
      ]);
    });
  });

  describe('input validation', () => {
    it('returns 400 when the question is an empty string', async () => {
      const app = createApp({
        openRouter: {
          questionAnswerer: stubAnswerer('답변'),
        },
      });

      const response = await app.request('/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: '' }),
      });

      expect(response.status).toBe(400);
      const body = (await response.json()) as { message: string };
      expect(body.message).toContain('question');
    });

    it('returns 400 when the question is whitespace only', async () => {
      const app = createApp({
        openRouter: {
          questionAnswerer: stubAnswerer('답변'),
        },
      });

      const response = await app.request('/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: '   \n\t  ' }),
      });

      expect(response.status).toBe(400);
    });

    it('returns 400 when the question field is missing', async () => {
      const app = createApp({
        openRouter: {
          questionAnswerer: stubAnswerer('답변'),
        },
      });

      const response = await app.request('/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
    });

    it('returns 400 when the question field is not a string', async () => {
      const app = createApp({
        openRouter: {
          questionAnswerer: stubAnswerer('답변'),
        },
      });

      const response = await app.request('/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: 123 }),
      });

      expect(response.status).toBe(400);
    });

    it('returns 400 for malformed JSON', async () => {
      const app = createApp({
        openRouter: {
          questionAnswerer: stubAnswerer('답변'),
        },
      });

      const response = await app.request('/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"question":',
      });

      expect(response.status).toBe(400);
    });
  });

  describe('error handling', () => {
    it('returns 500 when the QuestionAnswerer throws', async () => {
      const app = createApp({
        openRouter: {
          questionAnswerer: stubAnswerer(new Error('LLM down')),
        },
      });
      await seedDocument(app, { title: 'TypeScript', content: 'typescript body' });

      const response = await app.request('/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: 'typescript' }),
      });

      expect(response.status).toBe(500);
    });

    it('returns 503 when the QuestionAnswerer is not configured (no api key, no override)', async () => {
      const app = createApp({
        openRouter: {
          apiKey: undefined,
          questionAnswerer: undefined,
        },
      });

      const response = await app.request('/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: 'anything' }),
      });

      expect(response.status).toBe(503);
    });
  });
});
