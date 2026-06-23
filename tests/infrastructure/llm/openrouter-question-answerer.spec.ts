import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OpenRouterQuestionAnswerer } from '../../../src/infrastructure/llm/openrouter-question-answerer.js';

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

describe('OpenRouterQuestionAnswerer', () => {
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

  it('returns the answer string when the LLM responds successfully', async () => {
    fetchMock.mockResolvedValueOnce(buildOkResponse('타입스크립트는 정적 타입 언어입니다.'));

    const answerer = new OpenRouterQuestionAnswerer({ apiKey: 'test-key', model: 'openai/gpt-4o-mini' });

    const answer = await answerer.answer('타입스크립트가 뭐야?', ['# Title\nTypeScript content']);

    expect(answer).toBe('타입스크립트는 정적 타입 언어입니다.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('trims surrounding whitespace from the LLM answer', async () => {
    fetchMock.mockResolvedValueOnce(buildOkResponse('  답변 내용  '));

    const answerer = new OpenRouterQuestionAnswerer({ apiKey: 'test-key', model: 'openai/gpt-4o-mini' });

    const answer = await answerer.answer('질문', ['context']);

    expect(answer).toBe('답변 내용');
  });

  it('joins array-style content fragments returned by the LLM', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: [
                  { type: 'text', text: 'part 1 ' },
                  { type: 'text', text: 'part 2' },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const answerer = new OpenRouterQuestionAnswerer({ apiKey: 'test-key', model: 'openai/gpt-4o-mini' });

    const answer = await answerer.answer('질문', ['context']);

    expect(answer).toBe('part 1 part 2');
  });

  it('sends the prompt with model, system instruction, question and joined context', async () => {
    fetchMock.mockResolvedValueOnce(buildOkResponse('답변'));

    const answerer = new OpenRouterQuestionAnswerer({
      apiKey: 'secret',
      model: 'openai/gpt-4o-mini',
      siteUrl: 'https://example.com',
      appName: 'web-llm-wiki',
    });

    await answerer.answer('Hexagonal Architecture란?', [
      '# Doc A\nHexagonal architecture body',
      '# Doc B\nClean architecture body',
    ]);

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
    expect(body.messages[0].content).toContain('위키 문서');
    expect(body.messages[0].content).toContain('제공된 문서만');
    expect(body.messages[1].role).toBe('user');
    expect(body.messages[1].content).toContain('Hexagonal Architecture란?');
    expect(body.messages[1].content).toContain('Hexagonal architecture body');
    expect(body.messages[1].content).toContain('Clean architecture body');
  });

  it('throws when the HTTP response is not ok', async () => {
    fetchMock.mockResolvedValueOnce(buildErrorResponse(500));

    const answerer = new OpenRouterQuestionAnswerer({ apiKey: 'test-key', model: 'openai/gpt-4o-mini' });

    await expect(answerer.answer('질문', ['context'])).rejects.toThrow();
  });

  it('throws when fetch itself rejects (network failure)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));

    const answerer = new OpenRouterQuestionAnswerer({ apiKey: 'test-key', model: 'openai/gpt-4o-mini' });

    await expect(answerer.answer('질문', ['context'])).rejects.toThrow();
  });

  it('throws when the LLM body is missing the expected content field', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ choices: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const answerer = new OpenRouterQuestionAnswerer({ apiKey: 'test-key', model: 'openai/gpt-4o-mini' });

    await expect(answerer.answer('질문', ['context'])).rejects.toThrow();
  });

  it('throws when the LLM produces an empty answer', async () => {
    fetchMock.mockResolvedValueOnce(buildOkResponse('   '));

    const answerer = new OpenRouterQuestionAnswerer({ apiKey: 'test-key', model: 'openai/gpt-4o-mini' });

    await expect(answerer.answer('질문', ['context'])).rejects.toThrow();
  });

  it('forwards an AbortSignal so the request can time out', async () => {
    fetchMock.mockResolvedValueOnce(buildOkResponse('답변'));

    const answerer = new OpenRouterQuestionAnswerer({
      apiKey: 'test-key',
      model: 'openai/gpt-4o-mini',
      timeoutMs: 30_000,
    });

    await answerer.answer('질문', ['context']);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('throws when the request is aborted by the timeout', async () => {
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

    const answerer = new OpenRouterQuestionAnswerer({
      apiKey: 'test-key',
      model: 'openai/gpt-4o-mini',
      timeoutMs: 5,
    });

    await expect(answerer.answer('질문', ['context'])).rejects.toThrow();
  });

  it('uses a custom baseUrl when provided', async () => {
    fetchMock.mockResolvedValueOnce(buildOkResponse('답변'));

    const answerer = new OpenRouterQuestionAnswerer({
      apiKey: 'test-key',
      model: 'openai/gpt-4o-mini',
      baseUrl: 'https://proxy.example.com/v1',
    });

    await answerer.answer('질문', ['context']);

    const [endpoint] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(endpoint).toBe('https://proxy.example.com/v1/chat/completions');
  });

  it('handles an empty context array by sending only the question', async () => {
    fetchMock.mockResolvedValueOnce(buildOkResponse('답변'));

    const answerer = new OpenRouterQuestionAnswerer({ apiKey: 'test-key', model: 'openai/gpt-4o-mini' });

    const answer = await answerer.answer('질문', []);

    expect(answer).toBe('답변');
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.messages[1].content).toContain('질문');
  });
});
