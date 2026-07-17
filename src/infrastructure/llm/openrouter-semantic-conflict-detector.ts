import type {
  SemanticConflictAnalysis,
  SemanticConflictDetector,
} from '../../application/ports/semantic-conflict-detector.js';
import type { WikiDocument } from '../../domain/wiki/document.js';

type OpenRouterSemanticConflictDetectorOptions = {
  apiKey: string;
  model: string;
  baseUrl?: string;
  siteUrl?: string;
  appName?: string;
  timeoutMs?: number;
};

type OpenRouterResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
};

type SemanticConflictResponseItem = {
  classification: 'conflict' | 'complementary' | 'uncertain';
  slug: string;
  title: string;
  subject: string;
  attribute: string;
  scope: string;
  timeframe: string;
  targetEvidence: string;
  candidateEvidence: string;
  explanation: string;
  confidence: 'high' | 'medium' | 'low';
};

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_TIMEOUT_MS = 15_000;

const SYSTEM_PROMPT = [
  'You detect semantic conflicts between wiki documents in the same domain.',
  'Only report factual contradictions: incompatible prices, dates, quantities, policies, requirements, or mutually exclusive claims about the same entity.',
  'Do not report overlap, paraphrases, missing details, or differences that can both be true.',
  'A conflict requires explicit claims about the same subject, attribute, scope, and timeframe that cannot both be true.',
  'Distinguish design or schema descriptions from current operational status, policy from implementation, and capability from actual use.',
  'Missing information is never an opposing claim. Do not infer a claim that is not explicitly written.',
  'Classify complementary perspectives as complementary and insufficient evidence as uncertain. Only conflict items will be saved.',
  'For both documents, copy the shortest exact supporting passage. Never paraphrase evidence.',
  'Write every explanation in natural Korean, even when the source documents are written in another language.',
  'Reply with JSON only.',
].join(' ');

export class OpenRouterSemanticConflictDetector implements SemanticConflictDetector {
  private readonly endpoint: string;
  private readonly timeoutMs: number;

  constructor(private readonly options: OpenRouterSemanticConflictDetectorOptions) {
    this.endpoint = `${options.baseUrl ?? DEFAULT_BASE_URL}/chat/completions`;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async detectConflicts(
    targetDocument: WikiDocument,
    candidatesInSameDomain: readonly WikiDocument[],
  ): Promise<SemanticConflictAnalysis[]> {
    if (candidatesInSameDomain.length === 0) {
      return [];
    }

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
            { role: 'user', content: buildUserPrompt(targetDocument, candidatesInSameDomain) },
          ],
          temperature: 0.2,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        return [];
      }

      const body = (await response.json()) as OpenRouterResponse;
      const raw = extractContent(body);
      if (raw === null) {
        return [];
      }

      return validateDetectedConflicts(
        parseSemanticConflictResponse(raw),
        targetDocument,
        candidatesInSameDomain,
      );
    } catch {
      return [];
    } finally {
      clearTimeout(timeout);
    }
  }
}

const buildUserPrompt = (
  target: WikiDocument,
  candidates: readonly WikiDocument[],
): string => {
  const candidateBlocks = candidates
    .map((doc, index) =>
      [
        `Candidate ${index + 1}`,
        `Slug: ${doc.title.toSlug()}`,
        `Title: ${doc.title.value}`,
        'Content:',
        doc.content,
      ].join('\n'),
    )
    .join('\n\n---\n\n');

  return [
    'Target document:',
    `Slug: ${target.title.toSlug()}`,
    `Title: ${target.title.value}`,
    'Content:',
    target.content,
    '',
    'Candidate documents from the same domain:',
    candidateBlocks,
    '',
    'Return this exact JSON shape:',
    '[{"classification":"conflict","slug":"candidate-slug","title":"Candidate Title","subject":"배송비","attribute":"금액","scope":"대한민국 일반 배송","timeframe":"현재","targetEvidence":"배송비는 3,000원이다.","candidateEvidence":"배송비는 4,000원이다.","explanation":"동일한 배송비를 서로 다른 금액으로 명시하고 있습니다.","confidence":"high"}]',
    'The explanation value must always be written in Korean.',
    'Return complementary or uncertain classifications too; they will be excluded after validation.',
    'Use confidence high, medium, or low. Return [] if there are no factual contradictions.',
  ].join('\n');
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

export const parseSemanticConflictResponse = (
  content: string,
): SemanticConflictAnalysis[] => {
  const json = extractJsonArray(content);
  if (json === null) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.flatMap((item): SemanticConflictAnalysis[] => {
    if (!isParsedSemanticConflict(item) || item.classification !== 'conflict') {
      return [];
    }
    return [
      {
        conflictingDocumentSlug: item.slug.trim(),
        conflictingDocumentTitle: item.title.trim(),
        explanation: item.explanation.trim(),
        confidence: item.confidence,
        subject: item.subject.trim(),
        attribute: item.attribute.trim(),
        scope: item.scope.trim(),
        timeframe: item.timeframe.trim(),
        targetEvidence: item.targetEvidence.trim(),
        candidateEvidence: item.candidateEvidence.trim(),
      },
    ];
  });
};

const extractJsonArray = (content: string): string | null => {
  const start = content.indexOf('[');
  const end = content.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) {
    return null;
  }
  return content.slice(start, end + 1);
};

const isParsedSemanticConflict = (value: unknown): value is SemanticConflictResponseItem => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.slug === 'string' &&
    candidate.slug.trim() !== '' &&
    typeof candidate.title === 'string' &&
    candidate.title.trim() !== '' &&
    typeof candidate.explanation === 'string' &&
    candidate.explanation.trim() !== '' &&
    (candidate.classification === 'conflict' ||
      candidate.classification === 'complementary' ||
      candidate.classification === 'uncertain') &&
    typeof candidate.subject === 'string' && candidate.subject.trim() !== '' &&
    typeof candidate.attribute === 'string' && candidate.attribute.trim() !== '' &&
    typeof candidate.scope === 'string' && candidate.scope.trim() !== '' &&
    typeof candidate.timeframe === 'string' && candidate.timeframe.trim() !== '' &&
    typeof candidate.targetEvidence === 'string' && candidate.targetEvidence.trim() !== '' &&
    typeof candidate.candidateEvidence === 'string' && candidate.candidateEvidence.trim() !== '' &&
    (candidate.confidence === 'high' ||
      candidate.confidence === 'medium' ||
      candidate.confidence === 'low')
  );
};

const validateDetectedConflicts = (
  conflicts: readonly SemanticConflictAnalysis[],
  target: WikiDocument,
  candidates: readonly WikiDocument[],
): SemanticConflictAnalysis[] => {
  const candidatesBySlug = new Map(candidates.map((candidate) => [candidate.title.toSlug(), candidate]));
  return conflicts.filter((conflict) => {
    const candidate = candidatesBySlug.get(conflict.conflictingDocumentSlug);
    return candidate !== undefined &&
      candidate.title.value === conflict.conflictingDocumentTitle &&
      containsEvidence(target.content, conflict.targetEvidence) &&
      containsEvidence(candidate.content, conflict.candidateEvidence);
  });
};

const containsEvidence = (content: string, evidence: string | undefined): boolean => {
  if (!evidence) return false;
  const normalize = (value: string): string => value.replace(/\s+/g, ' ').trim();
  return normalize(content).includes(normalize(evidence));
};
