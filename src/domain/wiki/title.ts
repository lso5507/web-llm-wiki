export class InvalidTitleError extends Error {
  constructor() {
    super('Title must not be empty');
    this.name = 'InvalidTitleError';
  }
}

export class Title {
  private constructor(public readonly value: string) {}

  static create(value: string): Title {
    const normalizedValue = value.trim();

    if (!normalizedValue) {
      throw new InvalidTitleError();
    }

    return new Title(normalizedValue);
  }

  equals(other: Title): boolean {
    return this.value === other.value;
  }

  toSlug(): string {
    return this.value.toLowerCase().replace(/\s+/g, '-');
  }
}
