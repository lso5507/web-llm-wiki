import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OpenRouterSemanticConflictDetector } from '../../../src/infrastructure/llm/openrouter-semantic-conflict-detector.js';
import { WikiDocument } from '../../../src/domain/wiki/document.js';
import { DocumentMetadata } from '../../../src/domain/wiki/document-metadata.js';
import { Title } from '../../../src/domain/wiki/title.js';

type FetchMock = ReturnType<typeof vi.fn>;

const documentWithDomain = (title: string, content: string): WikiDocument =>
  WikiDocument.create({
    title: Title.create(title),
    content,
    metadata: DocumentMetadata.from({ domain: 'shipping' }),
  });

const buildOkResponse = (content: string): Response =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

describe('OpenRouterSemanticConflictDetector', () => {
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

  it('returns no conflicts without calling OpenRouter when there are no candidates', async () => {
    const detector = new OpenRouterSemanticConflictDetector({
      apiKey: 'test-key',
      model: 'openai/gpt-4o-mini',
    });

    const result = await detector.detectConflicts(
      documentWithDomain('Shipping Fees', 'Korea shipping is 3000 KRW'),
      [],
    );

    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends same-domain documents to OpenRouter and maps JSON conflicts', async () => {
    fetchMock.mockResolvedValueOnce(
      buildOkResponse(
        '[{"classification":"conflict","slug":"shipping-policy","title":"Shipping Policy","subject":"한국 배송비","attribute":"금액","scope":"한국 배송","timeframe":"현재","targetEvidence":"Korea shipping is 3000 KRW","candidateEvidence":"Korea shipping is 4000 KRW","explanation":"한국 배송비가 한 문서에는 4,000원, 다른 문서에는 3,000원으로 안내되어 있습니다.","confidence":"high"}]',
      ),
    );
    const detector = new OpenRouterSemanticConflictDetector({
      apiKey: 'secret',
      model: 'openai/gpt-4o-mini',
      siteUrl: 'https://example.com',
      appName: 'web-llm-wiki',
    });

    const result = await detector.detectConflicts(
      documentWithDomain('Shipping Fees', 'Korea shipping is 3000 KRW'),
      [documentWithDomain('Shipping Policy', 'Korea shipping is 4000 KRW')],
    );

    expect(result).toEqual([
      {
        conflictingDocumentSlug: 'shipping-policy',
        conflictingDocumentTitle: 'Shipping Policy',
        explanation: '한국 배송비가 한 문서에는 4,000원, 다른 문서에는 3,000원으로 안내되어 있습니다.',
        confidence: 'high',
        subject: '한국 배송비',
        attribute: '금액',
        scope: '한국 배송',
        timeframe: '현재',
        targetEvidence: 'Korea shipping is 3000 KRW',
        candidateEvidence: 'Korea shipping is 4000 KRW',
      },
    ]);
    const [endpoint, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(endpoint).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secret');
    expect((init.headers as Record<string, string>)['HTTP-Referer']).toBe('https://example.com');
    expect((init.headers as Record<string, string>)['X-OpenRouter-Title']).toBe('web-llm-wiki');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('openai/gpt-4o-mini');
    expect(body.messages[1].content).toContain('Shipping Fees');
    expect(body.messages[1].content).toContain('Shipping Policy');
    expect(body.messages[0].content).toContain('natural Korean');
    expect(body.messages[1].content).toContain('always be written in Korean');
  });

  it('excludes complementary analyses and conflicts without exact evidence', async () => {
    fetchMock.mockResolvedValueOnce(buildOkResponse(JSON.stringify([
      {
        classification: 'complementary', slug: 'shipping-policy', title: 'Shipping Policy',
        subject: '푸시 테이블', attribute: '상태', scope: '운영', timeframe: '현재',
        targetEvidence: 'Korea shipping is 3000 KRW', candidateEvidence: 'Korea shipping is 4000 KRW',
        explanation: '구조와 운영 상태를 각각 설명합니다.', confidence: 'high',
      },
      {
        classification: 'conflict', slug: 'shipping-policy', title: 'Shipping Policy',
        subject: '배송비', attribute: '금액', scope: '한국', timeframe: '현재',
        targetEvidence: '문서에 없는 인용문', candidateEvidence: 'Korea shipping is 4000 KRW',
        explanation: '배송비가 다릅니다.', confidence: 'high',
      },
    ])));
    const detector = new OpenRouterSemanticConflictDetector({ apiKey: 'test-key', model: 'test-model' });

    const result = await detector.detectConflicts(
      documentWithDomain('Shipping Fees', 'Korea shipping is 3000 KRW'),
      [documentWithDomain('Shipping Policy', 'Korea shipping is 4000 KRW')],
    );

    expect(result).toEqual([]);
  });

  it('returns an empty array when the response is malformed', async () => {
    fetchMock.mockResolvedValueOnce(buildOkResponse('not json'));
    const detector = new OpenRouterSemanticConflictDetector({
      apiKey: 'test-key',
      model: 'openai/gpt-4o-mini',
    });

    const result = await detector.detectConflicts(
      documentWithDomain('Shipping Fees', 'Korea shipping is 3000 KRW'),
      [documentWithDomain('Shipping Policy', 'Korea shipping is 4000 KRW')],
    );

    expect(result).toEqual([]);
  });

  it('returns an empty array when the request is aborted by the timeout', async () => {
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      const signal = init.signal as AbortSignal | undefined;
      return await new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    });
    const detector = new OpenRouterSemanticConflictDetector({
      apiKey: 'test-key',
      model: 'openai/gpt-4o-mini',
      timeoutMs: 5,
    });

    const result = await detector.detectConflicts(
      documentWithDomain('Shipping Fees', 'Korea shipping is 3000 KRW'),
      [documentWithDomain('Shipping Policy', 'Korea shipping is 4000 KRW')],
    );

    expect(result).toEqual([]);
  });
});
