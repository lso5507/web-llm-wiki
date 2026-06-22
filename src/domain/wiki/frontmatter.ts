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
};

export class Frontmatter {
  private constructor(
    public readonly sources: readonly SourceReference[],
    public readonly tags: readonly string[],
    public readonly conflict: boolean,
  ) {}

  static create(input: FrontmatterInput): Frontmatter {
    return new Frontmatter(
      Object.freeze([...(input.sources ?? [])]),
      Object.freeze([...(input.tags ?? [])]),
      input.conflict ?? false,
    );
  }
}
