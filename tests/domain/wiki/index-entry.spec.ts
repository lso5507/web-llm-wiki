import { describe, expect, it } from 'vitest';

import { InvalidIndexEntryError, IndexEntry } from '../../../src/domain/wiki/index-entry.js';

describe('IndexEntry', () => {
  it('creates an entry from title and summary', () => {
    const entry = IndexEntry.create({
      title: 'Orenz Test Account',
      summary: 'Test account credentials',
      sourceCount: 2,
    });

    expect(entry.title).toBe('Orenz Test Account');
    expect(entry.summary).toBe('Test account credentials');
    expect(entry.sourceCount).toBe(2);
  });

  it('rejects empty title or summary', () => {
    expect(() => IndexEntry.create({ title: '', summary: 'x' })).toThrow(InvalidIndexEntryError);
    expect(() => IndexEntry.create({ title: 'x', summary: '   ' })).toThrow('Index entry summary must not be empty');
  });

  it('sorts alphabetically by title', () => {
    const foo = IndexEntry.create({ title: 'Foo', summary: 'foo' });
    const bar = IndexEntry.create({ title: 'Bar', summary: 'bar' });

    expect([foo, bar].sort(IndexEntry.compareByTitle).map((entry) => entry.title)).toEqual(['Bar', 'Foo']);
  });
});
