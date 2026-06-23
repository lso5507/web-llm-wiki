import { Domain } from './domain.js';
import { Status } from './status.js';
import type { SemanticConflictAnalysis } from '../../application/ports/semantic-conflict-detector.js';

export class InvalidDocumentMetadataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidDocumentMetadataError';
  }
}

type DocumentMetadataInput = {
  status?: string;
  domain?: string | null;
  tags?: readonly string[];
  conflict?: boolean;
  conflictWith?: readonly string[];
  semanticConflicts?: readonly SemanticConflictAnalysis[];
};

export class DocumentMetadata {
  private constructor(
    public readonly status: Status,
    public readonly domain: Domain | null,
    public readonly tags: readonly string[],
    public readonly conflict: boolean,
    public readonly conflictWith: readonly string[],
    public readonly semanticConflicts: readonly SemanticConflictAnalysis[],
  ) {
    Object.freeze(this);
  }

  static from(input: DocumentMetadataInput = {}): DocumentMetadata {
    const status = Status.from(input.status ?? 'draft');
    const domain = resolveDomain(input.domain);
    const tags = validateStringList(input.tags ?? [], 'tags');
    const conflictWith = validateStringList(
      input.conflictWith ?? [],
      'conflictWith',
    );
    const conflict = input.conflict ?? false;
    const semanticConflicts = validateSemanticConflicts(
      input.semanticConflicts ?? [],
    );

    return new DocumentMetadata(
      status,
      domain,
      Object.freeze([...tags]),
      conflict,
      Object.freeze([...conflictWith]),
      Object.freeze(semanticConflicts.map((conflict) => ({ ...conflict }))),
    );
  }

  withSemanticConflicts(
    semanticConflicts: readonly SemanticConflictAnalysis[],
  ): DocumentMetadata {
    return DocumentMetadata.from({
      status: this.status.value,
      domain: this.domain ? this.domain.value : null,
      tags: [...this.tags],
      conflict: this.conflict,
      conflictWith: [...this.conflictWith],
      semanticConflicts,
    });
  }
}

function resolveDomain(value: string | null | undefined): Domain | null {
  if (value === undefined || value === null) {
    return null;
  }
  return Domain.from(value);
}

function validateStringList(
  list: readonly string[],
  fieldName: string,
): readonly string[] {
  for (const item of list) {
    if (typeof item !== 'string' || item.trim() === '') {
      throw new InvalidDocumentMetadataError(
        `${fieldName} must contain only non-empty strings`,
      );
    }
  }
  return list;
}

function validateSemanticConflicts(
  list: readonly SemanticConflictAnalysis[],
): readonly SemanticConflictAnalysis[] {
  for (const item of list) {
    if (
      typeof item.conflictingDocumentSlug !== 'string' ||
      item.conflictingDocumentSlug.trim() === '' ||
      typeof item.conflictingDocumentTitle !== 'string' ||
      item.conflictingDocumentTitle.trim() === '' ||
      typeof item.explanation !== 'string' ||
      item.explanation.trim() === '' ||
      !['high', 'medium', 'low'].includes(item.confidence)
    ) {
      throw new InvalidDocumentMetadataError('semanticConflicts must contain valid conflict analyses');
    }
  }
  return list;
}
