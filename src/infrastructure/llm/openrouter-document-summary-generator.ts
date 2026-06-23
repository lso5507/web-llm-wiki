import type {
  DocumentSummaryGenerator,
  DocumentSummaryResult,
  GenerateDocumentSummaryInput,
} from '../../application/ports/document-summary-generator.js';
import { DOMAIN_CATALOG } from '../../domain/wiki/taxonomy/domain-taxonomy.js';

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

  async generate(input: GenerateDocumentSummaryInput): Promise<DocumentSummaryResult> {
    const domainExamples = DOMAIN_CATALOG.slice(0, 8)
      .map((d) => `"${d.label}"`)
      .join(', ');

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
            content: `당신은 위키 문서 요약 및 분류 전문가입니다.
주어진 문서를 150-300자로 요약하고, 적절한 도메인 label(한국어)을 추출하세요.

응답 형식 (JSON):
{
  "summary": "한국어 요약 (150-300자)",
  "domain": "도메인 label (한국어, 예: ${domainExamples})",
  "confidence": 0.0~1.0
}`,
          },
          {
            role: 'user',
            content: [
              `제목: ${input.title}`,
              input.tags?.length ? `태그: ${input.tags.join(', ')}` : null,
              '내용:',
              input.content,
            ]
              .filter(Boolean)
              .join('\n'),
          },
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter request failed with status ${response.status}`);
    }

    const body = (await response.json()) as OpenRouterResponse;
    const content = this.extractContent(body);

    if (!content) {
      throw new Error('OpenRouter returned empty content');
    }

    const parsed = JSON.parse(content) as {
      summary: string;
      domain: string;
      confidence: number;
    };

    if (!parsed.summary?.trim()) {
      throw new Error('OpenRouter returned empty summary');
    }

    return {
      summary: parsed.summary.trim(),
      domain: parsed.domain?.trim() || '기타',
      confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5)),
    };
  }

  private extractContent(body: OpenRouterResponse): string | null {
    const content = body.choices?.[0]?.message?.content;
    if (typeof content === 'string') {
      return content;
    }
    if (Array.isArray(content)) {
      return content.map((item) => item.text ?? '').join('');
    }
    return null;
  }
}
