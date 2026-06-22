import type {
  DocumentSummaryGenerator,
  GenerateDocumentSummaryInput,
} from '../../application/ports/document-summary-generator.js';

type OpenRouterDocumentSummaryGeneratorOptions = {
  apiKey: string;
  model: string;
  baseUrl?: string;
  siteUrl?: string;
  appName?: string;
};

type OpenRouterResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
};

export class OpenRouterDocumentSummaryGenerator implements DocumentSummaryGenerator {
  private readonly endpoint: string;

  constructor(private readonly options: OpenRouterDocumentSummaryGeneratorOptions) {
    this.endpoint = `${options.baseUrl ?? 'https://openrouter.ai/api/v1'}/chat/completions`;
  }

  async generate(input: GenerateDocumentSummaryInput): Promise<string> {
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
          {
            role: 'system',
            content:
              'You write short factual Korean summaries for wiki index entries. Respond with one concise sentence only.',
          },
          {
            role: 'user',
            content: [
              `Title: ${input.title}`,
              input.tags?.length ? `Tags: ${input.tags.join(', ')}` : null,
              'Document content:',
              input.content,
            ]
              .filter(Boolean)
              .join('\n'),
          },
        ],
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter request failed with status ${response.status}`);
    }

    const body = (await response.json()) as OpenRouterResponse;
    const content = body.choices?.[0]?.message?.content;
    const summary = Array.isArray(content)
      ? content
          .map((item) => item.text ?? '')
          .join('')
          .trim()
      : content?.trim();

    if (!summary) {
      throw new Error('OpenRouter returned an empty summary');
    }

    return summary;
  }
}
