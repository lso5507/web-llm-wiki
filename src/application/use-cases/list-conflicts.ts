import type { DocumentRepository } from '../ports/document-repository.js';

export type ConflictInfo = {
  documentId: string;
  documentTitle: string;
  domain: string;
  conflictingDocumentId: string;
  conflictingDocumentTitle: string;
  explanation: string;
  confidence: 'high' | 'medium' | 'low';
};

export class ListConflictsUseCase {
  constructor(private readonly documentRepository: DocumentRepository) {}

  async execute(): Promise<ConflictInfo[]> {
    const documents = await this.documentRepository.findAll();
    const conflicts: ConflictInfo[] = [];

    for (const document of documents) {
      const semanticConflicts = document.metadata.semanticConflicts;
      if (!semanticConflicts || semanticConflicts.length === 0) {
        continue;
      }

      for (const conflict of semanticConflicts) {
        conflicts.push({
          documentId: document.title.toSlug(),
          documentTitle: document.title.value,
          domain: document.metadata.domain?.value ?? '',
          conflictingDocumentId: conflict.conflictingDocumentSlug,
          conflictingDocumentTitle: conflict.conflictingDocumentTitle,
          explanation: conflict.explanation,
          confidence: conflict.confidence,
        });
      }
    }

    return conflicts;
  }
}
