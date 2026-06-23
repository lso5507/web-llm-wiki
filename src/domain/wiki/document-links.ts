export class InvalidDocumentLinksError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidDocumentLinksError';
  }
}

type DocumentLinksInput = {
  outbound?: readonly string[];
  broken?: readonly string[];
};

export class DocumentLinks {
  private constructor(
    public readonly outbound: readonly string[],
    public readonly broken: readonly string[],
  ) {
    Object.freeze(this);
  }

  static empty(): DocumentLinks {
    return new DocumentLinks(Object.freeze([]), Object.freeze([]));
  }

  static from(input: DocumentLinksInput = {}): DocumentLinks {
    const outbound = validateStringList(input.outbound ?? [], 'outbound');
    const broken = validateStringList(input.broken ?? [], 'broken');

    return new DocumentLinks(
      Object.freeze([...outbound]),
      Object.freeze([...broken]),
    );
  }

  hasBroken(): boolean {
    return this.broken.length > 0;
  }
}

const validateStringList = (
  list: readonly string[],
  fieldName: string,
): readonly string[] => {
  for (const item of list) {
    if (typeof item !== 'string' || item.trim() === '') {
      throw new InvalidDocumentLinksError(
        `${fieldName} must contain only non-empty strings`,
      );
    }
  }
  return list;
};
