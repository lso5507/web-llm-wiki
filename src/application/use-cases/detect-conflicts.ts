import type { WikiDocument } from '../../domain/wiki/document.js';

const TAG_OVERLAP_THRESHOLD = 5;

export type DetectConflictsInput = {
  document: WikiDocument;
  allDocuments: readonly WikiDocument[];
};

/**
 * Detects conflicts between a document and the rest of the wiki corpus.
 *
 * Detection rules:
 *  1. Same case-insensitive title with a different slug.
 *  2. Five or more shared tags (computed as set intersection on the target's tag set).
 *  3. Self-link: the document's own slug appears in its outbound links.
 *
 * Output: a deduplicated list of slugs that conflict with the input document.
 */
export class DetectConflictsUseCase {
  async execute(input: DetectConflictsInput): Promise<string[]> {
    const { document, allDocuments } = input;
    const targetSlug = document.title.toSlug();
    const targetTitleLower = document.title.value.toLowerCase();
    const targetTags = new Set(document.metadata.tags);

    const flagged: string[] = [];
    const seen = new Set<string>();

    for (const other of allDocuments) {
      const otherSlug = other.title.toSlug();
      // Same-slug docs are treated as the same document; skip self.
      if (otherSlug === targetSlug) {
        continue;
      }

      if (seen.has(otherSlug)) {
        continue;
      }

      if (sameCaseInsensitiveTitle(other.title.value, targetTitleLower)) {
        flagged.push(otherSlug);
        seen.add(otherSlug);
        continue;
      }

      if (countSharedTags(other.metadata.tags, targetTags) >= TAG_OVERLAP_THRESHOLD) {
        flagged.push(otherSlug);
        seen.add(otherSlug);
      }
    }

    if (document.links.outbound.includes(targetSlug) && !seen.has(targetSlug)) {
      flagged.push(targetSlug);
      seen.add(targetSlug);
    }

    return flagged;
  }
}

const sameCaseInsensitiveTitle = (
  candidate: string,
  targetTitleLower: string,
): boolean => candidate.toLowerCase() === targetTitleLower;

const countSharedTags = (
  candidateTags: readonly string[],
  targetTags: ReadonlySet<string>,
): number => {
  const seen = new Set<string>();
  let overlap = 0;
  for (const tag of candidateTags) {
    if (seen.has(tag)) {
      continue;
    }
    seen.add(tag);
    if (targetTags.has(tag)) {
      overlap += 1;
    }
  }
  return overlap;
};
