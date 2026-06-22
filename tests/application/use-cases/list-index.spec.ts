import { describe, expect, it } from 'vitest';

import type { IndexCatalog } from '../../../src/application/ports/index-catalog.js';
import { ListIndexUseCase } from '../../../src/application/use-cases/list-index.js';
import { IndexEntry } from '../../../src/domain/wiki/index-entry.js';

class FakeIndexCatalog implements IndexCatalog {
  constructor(private readonly entries: IndexEntry[]) {}

  async upsert(): Promise<void> {
    throw new Error('not used');
  }

  async list(): Promise<IndexEntry[]> {
    return this.entries;
  }
}

describe('ListIndexUseCase', () => {
  it('returns entries sorted by title', async () => {
    const useCase = new ListIndexUseCase(
      new FakeIndexCatalog([
        IndexEntry.create({ title: 'Foo', summary: 'foo' }),
        IndexEntry.create({ title: 'Bar', summary: 'bar' }),
      ]),
    );

    expect((await useCase.execute()).map((entry) => entry.title)).toEqual(['Bar', 'Foo']);
  });
});
