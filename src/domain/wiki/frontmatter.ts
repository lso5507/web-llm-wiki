import { Domain } from './domain.js';

export type SourceReference = {
  pageId: string;
  title: string;
  url: string;
  lastSynced: string;
};

type FrontmatterInput = {
  sources?: SourceReference[];
  tags?: string[];
  conflict?: boolean;
  domain?: Domain | string | null;
  parent?: string | null;
};

export class Frontmatter {
  private constructor(
    public readonly sources: readonly SourceReference[],
    public readonly tags: readonly string[],
    public readonly conflict: boolean,
    public readonly domain: Domain | null,
    public readonly parent: string | null,
  ) {}

  static create(input: FrontmatterInput): Frontmatter {
    return new Frontmatter(
      Object.freeze([...(input.sources ?? [])]),
      Object.freeze([...(input.tags ?? [])]),
      input.conflict ?? false,
      resolveDomain(input.domain),
      resolveParent(input.parent),
    );
  }
}

const resolveDomain = (value: Domain | string | null | undefined): Domain | null => {
  if (value === undefined || value === null) {
    return null;
  }
  if (value instanceof Domain) {
    return value;
  }
  return Domain.from(value);
};

const resolveParent = (value: string | null | undefined): string | null => {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }
  return trimmed;
};
