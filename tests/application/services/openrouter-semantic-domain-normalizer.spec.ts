import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OpenRouterSemanticDomainNormalizer } from '../../../src/application/services/openrouter-semantic-domain-normalizer.js';
import type { NormalizationContext } from '../../../src/application/services/domain-normalizer.js';

type FetchMock = ReturnType<typeof vi.fn>;

const buildOkResponse = (content: string): Response =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

const buildErrorResponse = (status: number): Response =>
  new Response(JSON.stringify({ error: { message: 'boom' } }), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('OpenRouterSemanticDomainNormalizer', () => {
  let originalFetch: typeof globalThis.fetch;
  let fetchMock: FetchMock;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('normalize', () => {
    it('creates new domain when no existing domains', async () => {
      const normalizer = new OpenRouterSemanticDomainNormalizer({
        apiKey: 'test-key',
        model: 'openai/gpt-4o-mini',
      });

      const context: NormalizationContext = {
        title: '배송 안내',
        content: '배송 관련 정보입니다',
        existingDomains: [],
      };

      const result = await normalizer.normalize('배송', context);

      expect(result.domain.value).toBe('shipping');
      expect(result.isNew).toBe(true);
      expect(result.confidence).toBe(1.0);
      expect(result.reasoning).toContain('첫 번째 문서');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('matches to existing domain when LLM returns high confidence', async () => {
      fetchMock.mockResolvedValueOnce(
        buildOkResponse(
          JSON.stringify({
            matched: 'shipping',
            confidence: 0.92,
            reasoning: '물류는 배송의 상위 개념',
          }),
        ),
      );

      const normalizer = new OpenRouterSemanticDomainNormalizer({
        apiKey: 'test-key',
        model: 'openai/gpt-4o-mini',
      });

      const context: NormalizationContext = {
        title: '물류 센터 운영',
        content: '물류 처리 절차',
        existingDomains: [
          { id: 'shipping', label: '배송', documentCount: 5 },
          { id: 'payment', label: '결제', documentCount: 3 },
        ],
      };

      const result = await normalizer.normalize('물류', context);

      expect(result.domain.value).toBe('shipping');
      expect(result.isNew).toBe(false);
      expect(result.confidence).toBe(0.92);
      expect(result.reasoning).toContain('물류는 배송의 상위 개념');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('creates new domain when LLM returns low confidence', async () => {
      fetchMock.mockResolvedValueOnce(
        buildOkResponse(
          JSON.stringify({
            matched: null,
            confidence: 0.45,
            reasoning: '기존 도메인과 연관성 낮음',
          }),
        ),
      );

      const normalizer = new OpenRouterSemanticDomainNormalizer({
        apiKey: 'test-key',
        model: 'openai/gpt-4o-mini',
        confidenceThreshold: 0.8,
      });

      const context: NormalizationContext = {
        title: '신규 주제',
        content: '완전히 새로운 내용',
        existingDomains: [{ id: 'shipping', label: '배송', documentCount: 5 }],
      };

      const result = await normalizer.normalize('신규주제', context);

      expect(result.domain.value).toBe('other');
      expect(result.isNew).toBe(true);
      expect(result.confidence).toBe(0.45);
      expect(result.reasoning).toContain('낮은 연관성');
    });

    it('creates new domain when LLM call fails', async () => {
      fetchMock.mockResolvedValueOnce(buildErrorResponse(500));

      const normalizer = new OpenRouterSemanticDomainNormalizer({
        apiKey: 'test-key',
        model: 'openai/gpt-4o-mini',
      });

      const context: NormalizationContext = {
        title: '배송비용',
        content: '배송비 안내',
        existingDomains: [{ id: 'shipping', label: '배송', documentCount: 5 }],
      };

      const result = await normalizer.normalize('배송비용', context);

      expect(result.domain.value).toBe('shipping');
      expect(result.isNew).toBe(true);
      expect(result.confidence).toBe(0.0);
      expect(result.reasoning).toContain('신규 도메인 생성');
    });

    it('builds prompt with existing domains context', async () => {
      fetchMock.mockResolvedValueOnce(
        buildOkResponse(
          JSON.stringify({
            matched: 'shipping',
            confidence: 0.95,
            reasoning: '배송비용은 shipping 하위 개념',
          }),
        ),
      );

      const normalizer = new OpenRouterSemanticDomainNormalizer({
        apiKey: 'secret-key',
        model: 'openai/gpt-4o-mini',
        siteUrl: 'https://example.com',
        appName: 'test-wiki',
      });

      const context: NormalizationContext = {
        title: '배송비용 안내',
        content: '배송비 정책 상세 설명입니다',
        existingDomains: [
          { id: 'shipping', label: '배송', documentCount: 10 },
          { id: 'payment', label: '결제', documentCount: 5 },
        ],
      };

      await normalizer.normalize('배송비용', context);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [endpoint, init] = fetchMock.mock.calls[0] as [string, RequestInit];

      expect(endpoint).toBe('https://openrouter.ai/api/v1/chat/completions');

      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer secret-key');
      expect(headers['HTTP-Referer']).toBe('https://example.com');
      expect(headers['X-OpenRouter-Title']).toBe('test-wiki');

      const body = JSON.parse(init.body as string);
      expect(body.model).toBe('openai/gpt-4o-mini');
      expect(body.temperature).toBe(0.1);
      expect(body.response_format).toEqual({ type: 'json_object' });

      const userMessage = body.messages[1].content;
      expect(userMessage).toContain('shipping (배송, 10개 문서)');
      expect(userMessage).toContain('payment (결제, 5개 문서)');
      expect(userMessage).toContain('배송비용');
      expect(userMessage).toContain('배송비용 안내');
    });

    it('converts Korean label to kebab-case for new domains', async () => {
      const normalizer = new OpenRouterSemanticDomainNormalizer({
        apiKey: 'test-key',
        model: 'openai/gpt-4o-mini',
      });

      const context: NormalizationContext = {
        title: '고객 지원',
        content: '고객센터 운영',
        existingDomains: [],
      };

      const result = await normalizer.normalize('고객 지원', context);

      expect(result.domain.value).toBe('customer-support');
      expect(result.isNew).toBe(true);
    });

    it('clamps confidence to 0.0-1.0 range', async () => {
      fetchMock.mockResolvedValueOnce(
        buildOkResponse(
          JSON.stringify({
            matched: 'shipping',
            confidence: 1.5,
            reasoning: 'test',
          }),
        ),
      );

      const normalizer = new OpenRouterSemanticDomainNormalizer({
        apiKey: 'test-key',
        model: 'openai/gpt-4o-mini',
      });

      const context: NormalizationContext = {
        title: 'test',
        content: 'test',
        existingDomains: [{ id: 'shipping', label: '배송', documentCount: 1 }],
      };

      const result = await normalizer.normalize('test', context);

      expect(result.confidence).toBe(1.0);
    });
  });
});
