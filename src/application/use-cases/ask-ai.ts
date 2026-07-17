import type { DocumentRepository } from '../ports/document-repository.js';
import type { QuestionAnswerer } from '../ports/question-answerer.js';
import type { EmbeddingGenerator } from '../ports/embedding-generator.js';
import type { EmbeddingStore } from '../ports/embedding-store.js';
import type { IndexCatalog } from '../ports/index-catalog.js';
import type { WikiDocument } from '../../domain/wiki/document.js';
import type { SemanticIndexSearcher } from '../services/semantic-index-searcher.js';

export type AskAIInput = {
  question: string;
};

export type AskAISource = {
  id: string;
  title: string;
};

export type AskAIConflictPair = {
  left: AskAISource;
  right: AskAISource;
  explanation: string;
  confidence: 'high' | 'medium' | 'low';
};

export type AskAIOutput = {
  answer: string;
  sources: AskAISource[];
  conflicts: AskAIConflictPair[];
};

const TOP_K = 3;
const HIGH_CONFIDENCE_COVERAGE = 0.6;
// Multilingual E5 scores unrelated short texts relatively high, so accepting a
// source below this boundary tends to produce confident-looking false matches.
const MIN_SEMANTIC_SIMILARITY = 0.9;

type RankedCandidate = {
  slug: string;
  score: number;
};

export class EmptyQuestionError extends Error {
  constructor() {
    super('Question must not be empty');
    this.name = 'EmptyQuestionError';
  }
}

export class AskAIUseCase {
  constructor(
    private readonly documentRepository: DocumentRepository,
    private readonly questionAnswerer: QuestionAnswerer,
    private readonly embeddingGenerator?: EmbeddingGenerator,
    private readonly indexSearcher?: SemanticIndexSearcher,
    private readonly indexCatalog?: IndexCatalog,
    private readonly embeddingStore?: EmbeddingStore,
  ) {}

  async execute(input: AskAIInput): Promise<AskAIOutput> {
    const question = input.question.trim();
    if (question === '') {
      throw new EmptyQuestionError();
    }

    const slugs = await this.selectTopK(question);
    const matchedDocuments = await this.loadDocumentsBySlugs(slugs);
    const conflicts = collectConflictPairs(matchedDocuments);
    const context = matchedDocuments.map(buildContextEntry);
    const sources = matchedDocuments.map((document) => ({
      id: document.title.toSlug(),
      title: document.title.value,
    }));

    if (conflicts.length > 0) {
      return {
        answer:
          '충돌된 문서에 대한 지식입니다. 해당 문서 충돌을 우선적으로 해결하여주세요. 아래 [explore]에서 충돌된 내용을 먼저 확인해주세요.',
        sources,
        conflicts,
      };
    }

    const answer = await this.questionAnswerer.answer(question, context);

    return { answer, sources, conflicts };
  }

  private async selectTopK(question: string): Promise<string[]> {
    const indexCandidates = await this.searchIndex(question);
    if (isHighConfidenceIndexMatch(question, indexCandidates)) {
      return indexCandidates.slice(0, TOP_K).map((candidate) => candidate.slug);
    }

    if (this.embeddingGenerator && this.indexSearcher && this.embeddingStore) {
      try {
        await this.rebuildEmbeddings();
        const queryVector = await this.embeddingGenerator.embed(`query: ${question}`);
        const ranked = (await this.indexSearcher.findTopK(queryVector, TOP_K)).filter(
          (entry) => entry.score >= MIN_SEMANTIC_SIMILARITY,
        );
        if (ranked.length > 0) {
          return mergeRankings(indexCandidates, ranked).slice(0, TOP_K).map((entry) => entry.slug);
        }
      } catch (error) {
        console.warn('Semantic search failed, falling back to keyword search:', error);
      }
    }

    if (indexCandidates.length > 0) {
      return indexCandidates.slice(0, TOP_K).map((candidate) => candidate.slug);
    }
    return this.legacyKeywordSearch(question);
  }

  private async searchIndex(question: string): Promise<RankedCandidate[]> {
    if (!this.indexCatalog) {
      return [];
    }

    const tokens = tokenize(question);
    const entries = await this.indexCatalog.list();
    const documents = await this.documentRepository.findAll();
    const slugByTitle = new Map(documents.map((document) => [document.title.value, document.title.toSlug()]));

    return entries
      .map((entry) => ({
        slug: slugByTitle.get(entry.title) ?? '',
        score: scoreIndexEntry(entry.title, entry.summary, tokens),
      }))
      .filter((entry) => entry.slug !== '' && entry.score > 0)
      .sort((left, right) => right.score - left.score);
  }

  private async rebuildEmbeddings(): Promise<void> {
    if (!this.embeddingGenerator || !this.embeddingStore || !this.indexCatalog) {
      return;
    }

    const entries = await this.indexCatalog.list();
    const documents = await this.documentRepository.findAll();
    const slugByTitle = new Map(documents.map((document) => [document.title.value, document.title.toSlug()]));
    const passages = entries
      .map((entry) => ({
        slug: slugByTitle.get(entry.title),
        text: `passage: ${entry.title}\n${entry.summary}`,
      }))
      .filter((entry): entry is { slug: string; text: string } => Boolean(entry.slug));

    if (passages.length === 0) {
      return;
    }

    const vectors = await this.embeddingGenerator.embedBatch(passages.map((entry) => entry.text));
    await Promise.all(
      passages.map((entry, index) =>
        this.embeddingStore!.put(entry.slug, vectors[index]!, this.embeddingGenerator!.modelId),
      ),
    );
  }

  private async legacyKeywordSearch(question: string): Promise<string[]> {
    const tokens = tokenize(question);
    const candidates = await this.documentRepository.findAll();
    const ranked = rankByKeywordFrequency(candidates, tokens).slice(0, TOP_K);
    return ranked.map((entry) => entry.document.title.toSlug());
  }

  private async loadDocumentsBySlugs(slugs: string[]): Promise<WikiDocument[]> {
    const documents: WikiDocument[] = [];
    for (const slug of slugs) {
      const document = await this.documentRepository.findById(slug);
      if (document) {
        documents.push(document);
      }
    }
    return documents;
  }
}

// Tokenize by separately extracting ASCII alphanumeric runs and Hangul runs
// (\uAC00-\uD7AF = Hangul syllables, \u3131-\u318F = Hangul compatibility jamo)
// so a mixed-script query like "TypeScript가 뭐야?" splits into
// ["typescript", "가", "뭐야"] and still matches Latin-only documents.
const tokenize = (text: string): string[] => {
  const matches = text.toLowerCase().match(/[a-z0-9]+|[\uAC00-\uD7AF\u3131-\u318F]+/g);
  return matches ? Array.from(matches) : [];
};

const rankByKeywordFrequency = (
  documents: readonly WikiDocument[],
  tokens: readonly string[],
): Array<{ document: WikiDocument; score: number }> => {
  const scored = documents
    .map((document) => ({
      document,
      score: scoreDocument(document, tokens),
    }))
    .filter((entry) => entry.score > 0);

  scored.sort((a, b) => b.score - a.score);
  return scored;
};

const scoreDocument = (document: WikiDocument, tokens: readonly string[]): number => {
  const haystack = `${document.title.value}\n${document.content}`.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    score += countOccurrences(haystack, token);
  }
  return score;
};

const countOccurrences = (haystack: string, needle: string): number => {
  if (needle === '') {
    return 0;
  }
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
};

const scoreIndexEntry = (title: string, summary: string, tokens: readonly string[]): number => {
  const normalizedTitle = normalizeForMatch(title);
  const normalizedSummary = normalizeForMatch(summary);
  return tokens.reduce((score, token) => {
    const normalizedToken = normalizeForMatch(token);
    if (!normalizedToken) return score;
    const titleScore = normalizedTitle.includes(normalizedToken) ? 5 : 0;
    const summaryScore = normalizedSummary.includes(normalizedToken) ? 2 : 0;
    return score + titleScore + summaryScore;
  }, 0);
};

const normalizeForMatch = (text: string): string => text.toLowerCase().replace(/\s+/g, '');

const isHighConfidenceIndexMatch = (
  question: string,
  candidates: readonly RankedCandidate[],
): boolean => {
  if (candidates.length === 0) return false;
  const tokens = tokenize(question).filter((token) => normalizeForMatch(token).length >= 2);
  if (tokens.length === 0) return false;
  const maximumTokenScore = tokens.length * 7;
  return candidates[0]!.score / maximumTokenScore >= HIGH_CONFIDENCE_COVERAGE;
};

const mergeRankings = (
  lexical: readonly RankedCandidate[],
  semantic: readonly RankedCandidate[],
): RankedCandidate[] => {
  const scores = new Map<string, number>();
  const addRanking = (entries: readonly RankedCandidate[], weight: number) => {
    entries.forEach((entry, rank) => {
      scores.set(entry.slug, (scores.get(entry.slug) ?? 0) + weight / (60 + rank + 1));
    });
  };
  addRanking(lexical, 1.2);
  addRanking(semantic, 1);
  return [...scores.entries()]
    .map(([slug, score]) => ({ slug, score }))
    .sort((left, right) => right.score - left.score);
};

const buildContextEntry = (document: WikiDocument): string =>
  [`# ${document.title.value}`, document.content].join('\n');

const collectConflictPairs = (documents: readonly WikiDocument[]): AskAIConflictPair[] => {
  const sourceMap = new Map(
    documents.map((document) => [document.title.toSlug(), document] as const),
  );
  const seen = new Set<string>();
  const conflicts: AskAIConflictPair[] = [];

  for (const document of documents) {
    const leftId = document.title.toSlug();
    for (const conflict of document.metadata.semanticConflicts) {
      const rightDocument = sourceMap.get(conflict.conflictingDocumentSlug);
      if (!rightDocument) {
        continue;
      }

      const pairKey = [leftId, conflict.conflictingDocumentSlug].sort().join('::');
      if (seen.has(pairKey)) {
        continue;
      }
      seen.add(pairKey);

      conflicts.push({
        left: { id: leftId, title: document.title.value },
        right: {
          id: rightDocument.title.toSlug(),
          title: rightDocument.title.value,
        },
        explanation: conflict.explanation,
        confidence: conflict.confidence,
      });
    }
  }

  return conflicts;
};
