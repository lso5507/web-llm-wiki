import type { DomainNormalizer, ExistingDomain, NormalizationContext, NormalizationResult } from './domain-normalizer.js';
import { Domain } from '../../domain/wiki/domain.js';

type OpenRouterSemanticNormalizerOptions = {
  apiKey: string;
  model: string;
  baseUrl?: string;
  siteUrl?: string;
  appName?: string;
  confidenceThreshold?: number;
};

type OpenRouterResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
};

type MatchingResult = {
  matched: string | null;
  confidence: number;
  reasoning: string;
};

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_CONFIDENCE_THRESHOLD = 0.8;

export class OpenRouterSemanticDomainNormalizer implements DomainNormalizer {
  private readonly endpoint: string;
  private readonly confidenceThreshold: number;

  constructor(private readonly options: OpenRouterSemanticNormalizerOptions) {
    this.endpoint = `${options.baseUrl ?? DEFAULT_BASE_URL}/chat/completions`;
    this.confidenceThreshold = options.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
  }

  async normalize(
    koreanLabel: string,
    context: NormalizationContext,
  ): Promise<NormalizationResult> {
    if (context.existingDomains.length === 0) {
      const canonicalId = this.toKebabCase(koreanLabel);
      return {
        domain: Domain.from(canonicalId),
        confidence: 1.0,
        isNew: true,
        reasoning: '첫 번째 문서 - 신규 도메인 생성',
      };
    }

    const matchingResult = await this.matchWithExistingDomains(
      koreanLabel,
      context,
    );

    if (
      matchingResult.confidence >= this.confidenceThreshold &&
      matchingResult.matched
    ) {
      return {
        domain: Domain.from(matchingResult.matched),
        confidence: matchingResult.confidence,
        isNew: false,
        reasoning: matchingResult.reasoning,
      };
    }

    const canonicalId = this.toKebabCase(koreanLabel);
    return {
      domain: Domain.from(canonicalId),
      confidence: matchingResult.confidence,
      isNew: true,
      reasoning: `기존 도메인과 낮은 연관성 (${matchingResult.confidence.toFixed(2)}) - 신규 도메인 생성`,
    };
  }

  private async matchWithExistingDomains(
    koreanLabel: string,
    context: NormalizationContext,
  ): Promise<MatchingResult> {
    const prompt = this.buildMatchingPrompt(koreanLabel, context);

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
            {
              role: 'system',
              content: '당신은 위키 문서 분류 전문가입니다. 의미론적 유사도를 기반으로 도메인을 매칭합니다.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) {
        return this.fallbackResult(koreanLabel);
      }

      const body = (await response.json()) as OpenRouterResponse;
      const content = this.extractContent(body);
      if (!content) {
        return this.fallbackResult(koreanLabel);
      }

      const parsed = JSON.parse(content) as MatchingResult;
      return {
        matched: parsed.matched,
        confidence: Math.max(0, Math.min(1, parsed.confidence)),
        reasoning: parsed.reasoning,
      };
    } catch {
      return this.fallbackResult(koreanLabel);
    }
  }

  private buildMatchingPrompt(
    koreanLabel: string,
    context: NormalizationContext,
  ): string {
    const domainList = context.existingDomains
      .map((d) => `- ${d.id} (${d.label}, ${d.documentCount}개 문서)`)
      .join('\n');

    return `
## 기존 도메인 목록
${domainList}

## 새 문서
제목: ${context.title}
추출된 도메인 label: ${koreanLabel}
내용 일부: ${context.content.substring(0, 300)}

## 질문
이 새 문서가 기존 도메인 중 어디에 가장 적합합니까?

응답 형식 (JSON):
{
  "matched": "기존 도메인 ID (또는 null)",
  "confidence": 0.0~1.0,
  "reasoning": "판단 근거 (한 문장)"
}

기준:
- confidence ≥ 0.8: 같은 도메인으로 묶어도 됨
- confidence < 0.8: 새 도메인 생성 권장
- 의미론적 유사도 우선 (keyword 매칭이 아님)
- 예: "물류" → "shipping" (유사 개념)
- 예: "배송비용" → "shipping" (하위 개념)
`.trim();
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

  private fallbackResult(koreanLabel: string): MatchingResult {
    return {
      matched: null,
      confidence: 0.0,
      reasoning: `LLM 호출 실패 - "${koreanLabel}" 신규 도메인 생성`,
    };
  }

  private toKebabCase(value: string): string {
    const hangulToRoman: Record<string, string> = {
      배송: 'shipping',
      결제: 'payment',
      환불: 'refund',
      상품: 'product',
      고객: 'customer',
      주문: 'order',
      재고: 'inventory',
      마케팅: 'marketing',
      지원: 'support',
      기술: 'tech',
      운영: 'operations',
      정책: 'policy',
    };

    let result = value.toLowerCase();

    for (const [hangul, roman] of Object.entries(hangulToRoman)) {
      result = result.replace(new RegExp(hangul, 'g'), roman);
    }

    result = result
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    return result || 'other';
  }
}
