import { describe, expect, it } from 'vitest';

import { Domain } from '../../../src/domain/wiki/domain.js';
import { InvalidIndexEntryError, IndexEntry } from '../../../src/domain/wiki/index-entry.js';
import { Status } from '../../../src/domain/wiki/status.js';

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

  it('defaults status to draft and domain to null when not provided', () => {
    const entry = IndexEntry.create({
      title: 'Foo',
      summary: 'foo summary',
    });

    expect(entry.status.value).toBe('draft');
    expect(entry.domain).toBeNull();
  });

  it('accepts a custom status', () => {
    const entry = IndexEntry.create({
      title: 'Foo',
      summary: 'foo summary',
      status: Status.from('review'),
    });

    expect(entry.status.value).toBe('review');
  });

  it('accepts a custom domain', () => {
    const entry = IndexEntry.create({
      title: 'Foo',
      summary: 'foo summary',
      domain: Domain.from('tech-stack'),
    });

    expect(entry.domain?.value).toBe('tech-stack');
  });

  it('accepts an explicit null domain', () => {
    const entry = IndexEntry.create({
      title: 'Foo',
      summary: 'foo summary',
      domain: null,
    });

    expect(entry.domain).toBeNull();
  });
});
