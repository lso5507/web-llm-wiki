const KEBAB_CASE_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export class InvalidDomainError extends Error {
  constructor(value: string) {
    super(
      `Invalid domain: "${value}". Must be kebab-case (lowercase alphanumerics separated by single hyphens, e.g. "tech-stack")`,
    );
    this.name = 'InvalidDomainError';
  }
}

export class Domain {
  private constructor(public readonly value: string) {
    Object.freeze(this);
  }

  static from(value: string): Domain {
    if (typeof value !== 'string' || !KEBAB_CASE_PATTERN.test(value)) {
      throw new InvalidDomainError(value);
    }
    return new Domain(value);
  }

  equals(other: Domain): boolean {
    return this.value === other.value;
  }
}
