import type { QuestionAnswerer } from '../../application/ports/question-answerer.js';

type OpenRouterQuestionAnswererOptions = {
  apiKey: string;
  model: string;
  baseUrl?: string;
  siteUrl?: string;
  appName?: string;
  /**
   * Maximum time in milliseconds to wait for the LLM response before aborting.
   * Defaults to 30 seconds — long enough for `gpt-4o-mini` to generate a full
   * answer, short enough that an HTTP client doesn't hang forever.
   */
  timeoutMs?: number;
};

type OpenRouterResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
};

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_TIMEOUT_MS = 30_000;

const SYSTEM_PROMPT = [
  '당신은 위키 문서를 기반으로 질문에 답하는 AI입니다.',
  '제공된 문서만 참고하세요.',
  '문서에 없는 내용은 추측하지 말고 "문서에서 찾을 수 없습니다"라고 답하세요.',
].join(' ');

export class QuestionAnsweringFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuestionAnsweringFailedError';
  }
}

export class OpenRouterQuestionAnswerer implements QuestionAnswerer {
  private readonly endpoint: string;
  private readonly timeoutMs: number;

  constructor(private readonly options: OpenRouterQuestionAnswererOptions) {
    this.endpoint = `${options.baseUrl ?? DEFAULT_BASE_URL}/chat/completions`;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async answer(question: string, context: readonly string[]): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          'Content-Type': 'application/json',
          ...(this.options.siteUrl ? { 'HTTP-Referer': this.options.siteUrl } : {}),
          ...(this.options.appName ? { 'X-OpenRouter-Title': this.options.appName } : {}),
        },
        body: JSON.stringify({
          model: this.options.model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: buildUserPrompt(question, context) },
          ],
          temperature: 0.2,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new QuestionAnsweringFailedError(
          `OpenRouter request failed with status ${response.status}`,
        );
      }

      const body = (await response.json()) as OpenRouterResponse;
      const raw = extractContent(body);
      if (raw === null) {
        throw new QuestionAnsweringFailedError('OpenRouter response did not contain content');
      }

      const trimmed = raw.trim();
      if (trimmed === '') {
        throw new QuestionAnsweringFailedError('OpenRouter returned an empty answer');
      }

      return trimmed;
    } finally {
      clearTimeout(timeout);
    }
  }
}

const buildUserPrompt = (question: string, context: readonly string[]): string => {
  const sections: string[] = [];

  if (context.length > 0) {
    sections.push('참고 문서:');
    context.forEach((doc, index) => {
      sections.push(`--- 문서 ${index + 1} ---`);
      sections.push(doc);
    });
    sections.push('');
  }

  sections.push(`질문: ${question}`);

  return sections.join('\n');
};

const extractContent = (body: OpenRouterResponse): string | null => {
  const content = body.choices?.[0]?.message?.content;
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content.map((item) => item.text ?? '').join('');
  }
  return null;
};
