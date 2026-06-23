import type { DocumentRepository } from '../ports/document-repository.js';
import { DocumentLinks } from '../../domain/wiki/document-links.js';

const LINK_PATTERN = /\[\[([^\]]+)\]\]/g;

export type ValidateLinksInput = {
  content: string;
  currentDocumentSlug: string;
};

export class ValidateLinksUseCase {
  constructor(private readonly documentRepository: DocumentRepository) {}

  async execute(input: ValidateLinksInput): Promise<DocumentLinks> {
    const candidateSlugs = extractCandidateSlugs(
      input.content,
      input.currentDocumentSlug,
    );

    if (candidateSlugs.length === 0) {
      return DocumentLinks.empty();
    }

    const broken: string[] = [];

    for (const slug of candidateSlugs) {
      const exists = await this.documentRepository.exists(slug);
      if (!exists) {
        broken.push(slug);
      }
    }

    return DocumentLinks.from({
      outbound: candidateSlugs,
      broken,
    });
  }
}

const extractCandidateSlugs = (
  content: string,
  currentDocumentSlug: string,
): string[] => {
  if (!content) {
    return [];
  }

  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const match of content.matchAll(LINK_PATTERN)) {
    const candidate = match[1]?.trim();
    if (!candidate) {
      continue;
    }
    if (candidate === currentDocumentSlug) {
      continue;
    }
    if (seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);
    ordered.push(candidate);
  }

  return ordered;
};
