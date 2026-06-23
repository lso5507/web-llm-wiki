import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OpenRouterDomainClassifier } from '../../../src/infrastructure/llm/openrouter-domain-classifier.js';

type FetchMock = ReturnType<typeof vi.fn>;

const buildOkResponse = (content: string): Response =>
  new Response(
    JSON.stringify({
      choices: [{ message: { content } }],
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );

const buildErrorResponse = (status: number): Response =>
  new Response(JSON.stringify({ error: { message: 'boom' } }), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('OpenRouterDomainClassifier', () => {
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

  it('returns a Domain value object when the LLM responds with a kebab-case label', async () => {
    fetchMock.mockResolvedValueOnce(buildOkResponse('tech-stack'));

    const classifier = new OpenRouterDomainClassifier({ apiKey: 'test-key', model: 'openai/gpt-4o-mini' });

    const result = await classifier.classify('TypeScript and Vitest setup', 'Tech Stack Setup');

    expect(result).not.toBeNull();
    expect(result?.value).toBe('tech-stack');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('strips surrounding whitespace, quotes and trailing punctuation before validation', async () => {
    fetchMock.mockResolvedValueOnce(buildOkResponse('  "api-design".  '));

    const classifier = new OpenRouterDomainClassifier({ apiKey: 'test-key', model: 'openai/gpt-4o-mini' });

    const result = await classifier.classify('REST endpoints', 'API Design Notes');

    expect(result?.value).toBe('api-design');
  });

  it('sends the prompt with model, system instruction, title and content payload', async () => {
    fetchMock.mockResolvedValueOnce(buildOkResponse('project-mgmt'));

    const classifier = new OpenRouterDomainClassifier({
      apiKey: 'secret',
      model: 'openai/gpt-4o-mini',
      siteUrl: 'https://example.com',
      appName: 'web-llm-wiki',
    });

    await classifier.classify('Sprint planning notes', 'Sprint 12');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [endpoint, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(endpoint).toBe('https://openrouter.ai/api/v1/chat/completions');

    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer secret');
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['HTTP-Referer']).toBe('https://example.com');
    expect(headers['X-OpenRouter-Title']).toBe('web-llm-wiki');

    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('openai/gpt-4o-mini');
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toContain('kebab-case');
    expect(body.messages[1].role).toBe('user');
    expect(body.messages[1].content).toContain('Title: Sprint 12');
    expect(body.messages[1].content).toContain('Sprint planning notes');
  });

  it('returns null and does not throw when the HTTP response is not ok', async () => {
    fetchMock.mockResolvedValueOnce(buildErrorResponse(500));

    const classifier = new OpenRouterDomainClassifier({ apiKey: 'test-key', model: 'openai/gpt-4o-mini' });

    const result = await classifier.classify('content', 'title');

    expect(result).toBeNull();
  });

  it('returns null and does not throw when fetch itself rejects', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));

    const classifier = new OpenRouterDomainClassifier({ apiKey: 'test-key', model: 'openai/gpt-4o-mini' });

    const result = await classifier.classify('content', 'title');

    expect(result).toBeNull();
  });

  it('returns null when the LLM responds with a non kebab-case label', async () => {
    fetchMock.mockResolvedValueOnce(buildOkResponse('Tech Stack!'));

    const classifier = new OpenRouterDomainClassifier({ apiKey: 'test-key', model: 'openai/gpt-4o-mini' });

    const result = await classifier.classify('content', 'title');

    expect(result).toBeNull();
  });

  it('returns null when the LLM body is missing the expected content field', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ choices: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const classifier = new OpenRouterDomainClassifier({ apiKey: 'test-key', model: 'openai/gpt-4o-mini' });

    const result = await classifier.classify('content', 'title');

    expect(result).toBeNull();
  });

  it('returns null when the LLM produces an empty string', async () => {
    fetchMock.mockResolvedValueOnce(buildOkResponse('   '));

    const classifier = new OpenRouterDomainClassifier({ apiKey: 'test-key', model: 'openai/gpt-4o-mini' });

    const result = await classifier.classify('content', 'title');

    expect(result).toBeNull();
  });

  it('forwards an AbortSignal to fetch so the request can time out', async () => {
    fetchMock.mockResolvedValueOnce(buildOkResponse('tech-stack'));

    const classifier = new OpenRouterDomainClassifier({
      apiKey: 'test-key',
      model: 'openai/gpt-4o-mini',
      timeoutMs: 1_500,
    });

    await classifier.classify('content', 'title');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('returns null when the request is aborted by the timeout', async () => {
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      const signal = init.signal as AbortSignal | undefined;
      return await new Promise<Response>((_resolve, reject) => {
        if (signal?.aborted) {
          reject(new DOMException('aborted', 'AbortError'));
          return;
        }
        signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    });

    const classifier = new OpenRouterDomainClassifier({
      apiKey: 'test-key',
      model: 'openai/gpt-4o-mini',
      timeoutMs: 5,
    });

    const result = await classifier.classify('content', 'title');

    expect(result).toBeNull();
  });

  it('uses a custom baseUrl when provided', async () => {
    fetchMock.mockResolvedValueOnce(buildOkResponse('tech-stack'));

    const classifier = new OpenRouterDomainClassifier({
      apiKey: 'test-key',
      model: 'openai/gpt-4o-mini',
      baseUrl: 'https://proxy.example.com/v1',
    });

    await classifier.classify('content', 'title');

    const [endpoint] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(endpoint).toBe('https://proxy.example.com/v1/chat/completions');
  });
});
