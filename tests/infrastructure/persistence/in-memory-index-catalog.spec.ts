import { describe, expect, it } from 'vitest';

import { IndexEntry } from '../../../src/domain/wiki/index-entry.js';
import { InMemoryIndexCatalog } from '../../../src/infrastructure/persistence/in-memory/in-memory-index-catalog.js';

describe('InMemoryIndexCatalog', () => {
  it('upserts entries and returns sorted results', async () => {
    const catalog = new InMemoryIndexCatalog();

    await catalog.upsert(IndexEntry.create({ title: 'Foo', summary: 'old' }));
    await catalog.upsert(IndexEntry.create({ title: 'Bar', summary: 'bar' }));
    await catalog.upsert(IndexEntry.create({ title: 'Foo', summary: 'new' }));

    expect(await catalog.list()).toEqual([
      IndexEntry.create({ title: 'Bar', summary: 'bar' }),
      IndexEntry.create({ title: 'Foo', summary: 'new' }),
    ]);
  });
});
