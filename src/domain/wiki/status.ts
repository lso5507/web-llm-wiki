export type StatusValue = 'draft' | 'review' | 'published';

const VALID_STATUSES: readonly StatusValue[] = Object.freeze([
  'draft',
  'review',
  'published',
]);

export class InvalidStatusError extends Error {
  constructor(value: string) {
    super(
      `Invalid status: "${value}". Must be one of: ${VALID_STATUSES.join(', ')}`,
    );
    this.name = 'InvalidStatusError';
  }
}

export class Status {
  private constructor(public readonly value: StatusValue) {
    Object.freeze(this);
  }

  static from(value: string): Status {
    if (!isValidStatus(value)) {
      throw new InvalidStatusError(value);
    }
    return new Status(value);
  }

  equals(other: Status): boolean {
    return this.value === other.value;
  }
}

function isValidStatus(value: string): value is StatusValue {
  return (VALID_STATUSES as readonly string[]).includes(value);
}
