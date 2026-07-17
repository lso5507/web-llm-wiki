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
  targetEvidence?: string;
  candidateEvidence?: string;
};

export interface SemanticConflictDetector {
  detectConflicts(
    targetDocument: WikiDocument,
    candidatesInSameDomain: readonly WikiDocument[],
  ): Promise<SemanticConflictAnalysis[]>;
}
