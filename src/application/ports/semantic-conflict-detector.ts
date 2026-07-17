import type { WikiDocument } from '../../domain/wiki/document.js';

export type SemanticConflictAnalysis = {
  conflictingDocumentSlug: string;
  conflictingDocumentTitle: string;
  explanation: string;
  confidence: 'high' | 'medium' | 'low';
  subject?: string;
  attribute?: string;
  scope?: string;
  timeframe?: string;
  targetTimeframe?: string;
  candidateTimeframe?: string;
  targetEvidence?: string;
  candidateEvidence?: string;
  who?: string;
  when?: string;
  targetWhen?: string;
  candidateWhen?: string;
  where?: string;
  what?: string;
  targetHow?: string;
  candidateHow?: string;
  why?: string;
};

export interface SemanticConflictDetector {
  detectConflicts(
    targetDocument: WikiDocument,
    candidatesInSameDomain: readonly WikiDocument[],
  ): Promise<SemanticConflictAnalysis[]>;
}
