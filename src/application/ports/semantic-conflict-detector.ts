import type { WikiDocument } from '../../domain/wiki/document.js';

export type SemanticConflictAnalysis = {
  conflictingDocumentSlug: string;
  conflictingDocumentTitle: string;
  explanation: string;
  confidence: 'high' | 'medium' | 'low';
};

export interface SemanticConflictDetector {
  detectConflicts(
    targetDocument: WikiDocument,
    candidatesInSameDomain: readonly WikiDocument[],
  ): Promise<SemanticConflictAnalysis[]>;
}
