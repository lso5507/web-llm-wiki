import type { DocumentRepository } from '../ports/document-repository.js';

const LINK_SEGMENT_PATTERN = /(\[\[[^\]]*\]\])/;
const REGEX_SPECIAL_CHARS = /[.*+?^${}()|[\]\\]/g;

export type SuggestLinksInput = {
  content: string;
  currentDocumentSlug: string;
};

export type SuggestLinksResult = {
  content: string;
  linksAdded: number;
};

export class SuggestLinksUseCase {
  constructor(private readonly documentRepository: DocumentRepository) {}

  async execute(input: SuggestLinksInput): Promise<SuggestLinksResult> {
    if (!input.content) {
      return { content: input.content, linksAdded: 0 };
    }

    const candidates = await this.collectCandidates(input.currentDocumentSlug);
    if (candidates.length === 0) {
      return { content: input.content, linksAdded: 0 };
    }

    let content = input.content;
    let linksAdded = 0;

    for (const candidate of candidates) {
      const replaced = replaceOutsideExistingLinks(content, candidate);
      content = replaced.content;
      linksAdded += replaced.replacements;
    }

    return { content, linksAdded };
  }

  private async collectCandidates(
    currentDocumentSlug: string,
  ): Promise<readonly Candidate[]> {
    const documents = await this.documentRepository.findAll();
    const candidates: Candidate[] = [];

    for (const document of documents) {
      const slug = document.title.toSlug();
      if (slug === currentDocumentSlug) {
        continue;
      }
      candidates.push({
        title: document.title.value,
        slug,
        pattern: buildTitlePattern(document.title.value),
      });
    }

    candidates.sort((a, b) => b.title.length - a.title.length);
    return candidates;
  }
}

type Candidate = {
  title: string;
  slug: string;
  pattern: RegExp;
};

const buildTitlePattern = (title: string): RegExp => {
  const escaped = title.replace(REGEX_SPECIAL_CHARS, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'gi');
};

const replaceOutsideExistingLinks = (
  content: string,
  candidate: Candidate,
): { content: string; replacements: number } => {
  const segments = content.split(LINK_SEGMENT_PATTERN);
  let replacements = 0;

  const processed = segments.map((segment) => {
    if (isLinkSegment(segment)) {
      return segment;
    }
    return segment.replace(candidate.pattern, () => {
      replacements += 1;
      return `[[${candidate.slug}]]`;
    });
  });

  return {
    content: processed.join(''),
    replacements,
  };
};

const isLinkSegment = (segment: string): boolean =>
  segment.startsWith('[[') && segment.endsWith(']]');
