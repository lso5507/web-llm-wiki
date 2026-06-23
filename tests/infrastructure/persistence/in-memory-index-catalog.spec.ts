import { describe, expect, it } from 'vitest';

import { Domain } from '../../../src/domain/wiki/domain.js';
import { IndexEntry } from '../../../src/domain/wiki/index-entry.js';
import { Status } from '../../../src/domain/wiki/status.js';
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

  it('round-trips status and domain through upsert and list', async () => {
    const catalog = new InMemoryIndexCatalog();

    await catalog.upsert(
      IndexEntry.create({
        title: 'Foo',
        summary: 'foo summary',
        status: Status.from('review'),
        domain: Domain.from('tech-stack'),
      }),
    );

    const entries = await catalog.list();
    expect(entries).toHaveLength(1);
    expect(entries[0].status.value).toBe('review');
    expect(entries[0].domain?.value).toBe('tech-stack');
  });

  it('uses defaults (draft, null) when entry is created without status/domain', async () => {
    const catalog = new InMemoryIndexCatalog();

    await catalog.upsert(IndexEntry.create({ title: 'Foo', summary: 'foo' }));

    const entries = await catalog.list();
    expect(entries[0].status.value).toBe('draft');
    expect(entries[0].domain).toBeNull();
  });
});
