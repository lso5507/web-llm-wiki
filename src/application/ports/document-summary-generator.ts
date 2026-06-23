import type { DomainId } from '../../domain/wiki/taxonomy/domain-taxonomy.js';

export type GenerateDocumentSummaryInput = {
  title: string;
  content: string;
  tags?: string[];
};

export type DocumentSummaryResult = {
  /** Korean summary (150-300 characters) */
  summary: string;
  /** Classified top-level domain label (Korean) - null if not classified yet */
  domain: string | null;
  /** Classification confidence (0.0-1.0) */
  confidence: number;
};

export interface DocumentSummaryGenerator {
  /**
   * Generate Korean summary and classify domain in a single LLM call.
   *
   * Returns structured output: summary + domain + confidence.
   * Falls back to deterministic keyword matching if LLM fails.
   */
  generate(input: GenerateDocumentSummaryInput): Promise<DocumentSummaryResult>;
}
