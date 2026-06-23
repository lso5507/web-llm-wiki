import { Domain } from '../../domain/wiki/domain.js';
import type { DomainClassifier } from '../../application/ports/domain-classifier.js';

type OpenRouterDomainClassifierOptions = {
  apiKey: string;
  model: string;
  baseUrl?: string;
  siteUrl?: string;
  appName?: string;
  /**
   * Maximum time in milliseconds to wait for the LLM response before aborting.
   * Defaults to 10 seconds — long enough for `gpt-4o-mini`, short enough not
   * to block the document save flow.
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
const DEFAULT_TIMEOUT_MS = 10_000;

const SYSTEM_PROMPT = [
  'You classify wiki documents into a single primary domain.',
  'Reply with ONE label only, in kebab-case (lowercase letters, digits, single hyphens).',
  'Examples of valid labels: tech-stack, project-mgmt, api-design, data-modeling, dev-ops.',
  'No quotes, no punctuation, no explanations, no surrounding text.',
  'If the document is genuinely ambiguous or unclassifiable, reply with: unknown',
].join(' ');

export class OpenRouterDomainClassifier implements DomainClassifier {
  private readonly endpoint: string;
  private readonly timeoutMs: number;

  constructor(private readonly options: OpenRouterDomainClassifierOptions) {
    this.endpoint = `${options.baseUrl ?? DEFAULT_BASE_URL}/chat/completions`;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async classify(content: string, title: string): Promise<Domain | null> {
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
            {
              role: 'user',
              content: [`Title: ${title}`, 'Document content:', content].join('\n'),
            },
          ],
          temperature: 0,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        return null;
      }

      const body = (await response.json()) as OpenRouterResponse;
      const raw = extractContent(body);
      if (!raw) {
        return null;
      }

      const label = normalizeLabel(raw);
      if (!label) {
        return null;
      }

      return tryParseDomain(label);
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}

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

const normalizeLabel = (raw: string): string => {
  // The LLM may wrap the label in quotes and/or trail it with punctuation.
  // Iteratively strip wrapping quotes, surrounding punctuation, and whitespace
  // until the string stops changing — handles inputs like `  "api-design".  `.
  let cleaned = raw.trim();
  let previous: string;
  do {
    previous = cleaned;
    cleaned = cleaned.replace(/^['"`]+|['"`]+$/g, '');
    cleaned = cleaned.replace(/^[.,;:!?]+|[.,;:!?]+$/g, '');
    cleaned = cleaned.trim();
  } while (cleaned !== previous);
  return cleaned;
};

const tryParseDomain = (label: string): Domain | null => {
  if (label === '' || label.toLowerCase() === 'unknown') {
    return null;
  }
  try {
    return Domain.from(label);
  } catch {
    return null;
  }
};
