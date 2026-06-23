import type { DocumentRepository } from '../../application/ports/document-repository.js';

export class CircularHierarchyError extends Error {
  public readonly cycle: readonly string[];

  constructor(cycle: readonly string[]) {
    super(`Circular hierarchy detected: ${cycle.join(' -> ')}`);
    this.name = 'CircularHierarchyError';
    this.cycle = Object.freeze([...cycle]);
  }
}

const MAX_DEPTH = 1024;

export class HierarchyValidator {
  static async validateNoCircle(
    documentSlug: string,
    parentSlug: string | null | undefined,
    repository: DocumentRepository,
  ): Promise<void> {
    if (!parentSlug) {
      return;
    }

    if (documentSlug === parentSlug) {
      throw new CircularHierarchyError([documentSlug, documentSlug]);
    }

    const visited = new Set<string>();
    visited.add(documentSlug);

    const path: string[] = [documentSlug];
    let current: string | null = parentSlug;
    let depth = 0;

    while (current !== null) {
      if (depth >= MAX_DEPTH) {
        throw new CircularHierarchyError([...path, current]);
      }
      depth += 1;

      if (visited.has(current)) {
        throw new CircularHierarchyError([...path, current]);
      }

      visited.add(current);
      path.push(current);

      const ancestor = await repository.findById(current);
      if (ancestor === null) {
        return;
      }

      const next = ancestor.parentSlug;
      if (next === null || next === undefined) {
        return;
      }

      current = next;
    }
  }
}
