import { Domain } from './domain.js';
import { Status } from './status.js';

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
  status?: Status;
  domain?: Domain | null;
};

export class IndexEntry {
  private constructor(
    public readonly title: string,
    public readonly summary: string,
    public readonly sourceCount: number,
    public readonly status: Status,
    public readonly domain: Domain | null,
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

    return new IndexEntry(
      title,
      summary,
      input.sourceCount ?? 0,
      input.status ?? Status.from('draft'),
      input.domain ?? null,
    );
  }

  static compareByTitle(left: IndexEntry, right: IndexEntry): number {
    return left.title.localeCompare(right.title);
  }
}
