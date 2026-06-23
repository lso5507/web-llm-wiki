import { describe, expect, it } from 'vitest';

import type { IndexCatalog } from '../../../src/application/ports/index-catalog.js';
import { ListIndexUseCase } from '../../../src/application/use-cases/list-index.js';
import { Domain } from '../../../src/domain/wiki/domain.js';
import { IndexEntry } from '../../../src/domain/wiki/index-entry.js';
import { Status } from '../../../src/domain/wiki/status.js';

class FakeIndexCatalog implements IndexCatalog {
  constructor(private readonly entries: IndexEntry[]) {}

  async upsert(): Promise<void> {
    throw new Error('not used');
  }

  async list(): Promise<IndexEntry[]> {
    return this.entries;
  }

  async remove(): Promise<void> {
    throw new Error('not used');
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

  it('preserves status and domain on each returned entry', async () => {
    const useCase = new ListIndexUseCase(
      new FakeIndexCatalog([
        IndexEntry.create({
          title: 'Foo',
          summary: 'foo summary',
          status: Status.from('review'),
          domain: Domain.from('tech-stack'),
        }),
        IndexEntry.create({
          title: 'Bar',
          summary: 'bar summary',
        }),
      ]),
    );

    const result = await useCase.execute();

    expect(result.map((entry) => entry.title)).toEqual(['Bar', 'Foo']);
    expect(result[0].status.value).toBe('draft');
    expect(result[0].domain).toBeNull();
    expect(result[1].status.value).toBe('review');
    expect(result[1].domain?.value).toBe('tech-stack');
  });
});
