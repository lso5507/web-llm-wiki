import type { DocumentRepository } from '../ports/document-repository.js';
import type { WikiDocument } from '../../domain/wiki/document.js';

export type GetDocumentInput = {
  id: string;
};

export class GetDocumentUseCase {
  constructor(private readonly documentRepository: DocumentRepository) {}

  async execute(input: GetDocumentInput): Promise<WikiDocument | null> {
    return this.documentRepository.findById(input.id);
  }
}
