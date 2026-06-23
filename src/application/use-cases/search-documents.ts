import type { DocumentRepository } from '../ports/document-repository.js';
import type { WikiDocument } from '../../domain/wiki/document.js';

export type SearchDocumentsInput = {
  query?: string;
  domain?: string;
  status?: string;
  tags?: readonly string[];
};

export class SearchDocumentsUseCase {
  constructor(private readonly documentRepository: DocumentRepository) {}

  async execute(input: SearchDocumentsInput): Promise<WikiDocument[]> {
    const documents = await this.documentRepository.findAll();
    return documents.filter((document) => this.matches(document, input));
  }

  private matches(document: WikiDocument, input: SearchDocumentsInput): boolean {
    if (input.query !== undefined && !matchesQuery(document, input.query)) {
      return false;
    }

    if (input.domain !== undefined && !matchesDomain(document, input.domain)) {
      return false;
    }

    if (input.status !== undefined && document.metadata.status.value !== input.status) {
      return false;
    }

    if (input.tags !== undefined && !matchesTags(document, input.tags)) {
      return false;
    }

    return true;
  }
}

const matchesQuery = (document: WikiDocument, query: string): boolean => {
  const needle = query.toLowerCase();
  if (needle === '') {
    return true;
  }

  const haystacks = [document.title.value, document.content];
  return haystacks.some((field) => field.toLowerCase().includes(needle));
};

const matchesDomain = (document: WikiDocument, domain: string): boolean => {
  return document.metadata.domain?.value === domain;
};

const matchesTags = (document: WikiDocument, requiredTags: readonly string[]): boolean => {
  const documentTags = new Set(document.metadata.tags);
  return requiredTags.every((tag) => documentTags.has(tag));
};
