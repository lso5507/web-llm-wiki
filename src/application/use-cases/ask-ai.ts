import type { DocumentRepository } from '../ports/document-repository.js';
import type { QuestionAnswerer } from '../ports/question-answerer.js';
import type { EmbeddingGenerator } from '../ports/embedding-generator.js';
import type { WikiDocument } from '../../domain/wiki/document.js';
import type { SemanticIndexSearcher } from '../services/semantic-index-searcher.js';

export type AskAIInput = {
  question: string;
};

export type AskAISource = {
  id: string;
  title: string;
};

export type AskAIOutput = {
  answer: string;
  sources: AskAISource[];
};

const TOP_K = 3;

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
  ) {}

  async execute(input: AskAIInput): Promise<AskAIOutput> {
    const question = input.question.trim();
    if (question === '') {
      throw new EmptyQuestionError();
    }

    const slugs = await this.selectTopK(question);
    const matchedDocuments = await this.loadDocumentsBySlugs(slugs);
    const context = matchedDocuments.map(buildContextEntry);
    const sources = matchedDocuments.map((document) => ({
      id: document.title.toSlug(),
      title: document.title.value,
    }));

    const answer = await this.questionAnswerer.answer(question, context);

    return { answer, sources };
  }

  private async selectTopK(question: string): Promise<string[]> {
    if (this.embeddingGenerator && this.indexSearcher) {
      try {
        const queryVector = await this.embeddingGenerator.embed(question);
        const ranked = await this.indexSearcher.findTopK(queryVector, TOP_K);
        if (ranked.length > 0) {
          return ranked.map((r) => r.slug);
        }
      } catch (error) {
        console.warn('Semantic search failed, falling back to keyword search:', error);
      }
    }

    return this.legacyKeywordSearch(question);
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

  private async loadMatchedDocuments(
    ranked: ReadonlyArray<{ document: WikiDocument }>,
  ): Promise<WikiDocument[]> {
    const documents: WikiDocument[] = [];
    for (const entry of ranked) {
      const slug = entry.document.title.toSlug();
      const reloaded = await this.documentRepository.findById(slug);
      documents.push(reloaded ?? entry.document);
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

const buildContextEntry = (document: WikiDocument): string =>
  [`# ${document.title.value}`, document.content].join('\n');
