export class InvalidIndexEntryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidIndexEntryError';
  }
}

type IndexEntryInput = {
  title: string;
  summary: string;
  sourceCount?: number;
};

export class IndexEntry {
  private constructor(
    public readonly title: string,
    public readonly summary: string,
    public readonly sourceCount: number,
  ) {}

  static create(input: IndexEntryInput): IndexEntry {
    const title = input.title.trim();
    const summary = input.summary.trim();

    if (!title) {
      throw new InvalidIndexEntryError('Index entry title must not be empty');
    }

    if (!summary) {
      throw new InvalidIndexEntryError('Index entry summary must not be empty');
    }

    return new IndexEntry(title, summary, input.sourceCount ?? 0);
  }

  static compareByTitle(left: IndexEntry, right: IndexEntry): number {
    return left.title.localeCompare(right.title);
  }
}
