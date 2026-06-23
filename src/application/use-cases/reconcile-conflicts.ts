import type { DocumentRepository } from '../ports/document-repository.js';
import type { WikiDocument } from '../../domain/wiki/document.js';
import type { DetectConflictsUseCase } from './detect-conflicts.js';

export type ReconcileConflictsInput = {
  savedDocument: WikiDocument;
  documentRepository: DocumentRepository;
  conflictDetector?: DetectConflictsUseCase;
  removedSlugs?: readonly string[];
};

/**
 * Reconciles conflict markings across the wiki corpus after a document has been
 * persisted. The flow:
 *
 *   1. Detect conflicts for the saved document against the rest of the corpus.
 *   2. For every other document, ensure its `conflictWith` list contains the
 *      saved document's slug iff it is a current conflict, and remove any slugs
 *      passed via `removedSlugs` (e.g., the document's prior slug after rename).
 *   3. Update the saved document's own conflict state to match the detected set.
 *
 * The function is idempotent: invoking it multiple times with the same inputs
 * converges to the same persisted state.
 *
 * If `conflictDetector` is not provided, the function performs no work and
 * returns the saved document unchanged. This keeps conflict detection an
 * optional capability.
 */
export const reconcileConflicts = async (
  input: ReconcileConflictsInput,
): Promise<WikiDocument> => {
  const { savedDocument, documentRepository, conflictDetector } = input;
  const removedSlugs = input.removedSlugs ?? [];

  if (!conflictDetector) {
    return savedDocument;
  }

  const targetSlug = savedDocument.title.toSlug();
  const allDocs = await documentRepository.findAll();
  const otherDocs = allDocs.filter((doc) => doc.title.toSlug() !== targetSlug);

  const newConflicts = await conflictDetector.execute({
    document: savedDocument,
    allDocuments: otherDocs,
  });
  const newConflictSet = new Set(newConflicts);

  for (const other of otherDocs) {
    const otherSlug = other.title.toSlug();
    const original = other.metadata.conflictWith;
    let next = [...original];

    for (const removed of removedSlugs) {
      next = next.filter((slug) => slug !== removed);
    }

    const shouldRef = newConflictSet.has(otherSlug);
    const hasRef = next.includes(targetSlug);

    if (shouldRef && !hasRef) {
      next.push(targetSlug);
    } else if (!shouldRef && hasRef) {
      next = next.filter((slug) => slug !== targetSlug);
    }

    if (!arraysEqual(original, next)) {
      await documentRepository.save(other.withConflict(next));
    }
  }

  const expectedConflictFlag = newConflicts.length > 0;
  const targetShouldChange =
    !arraysEqual(savedDocument.metadata.conflictWith, newConflicts) ||
    savedDocument.metadata.conflict !== expectedConflictFlag;

  if (targetShouldChange) {
    const updated = savedDocument.withConflict(newConflicts);
    await documentRepository.save(updated);
    return updated;
  }

  return savedDocument;
};

const arraysEqual = (
  left: readonly string[],
  right: readonly string[],
): boolean => {
  if (left.length !== right.length) {
    return false;
  }
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) {
      return false;
    }
  }
  return true;
};
