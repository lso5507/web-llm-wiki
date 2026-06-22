import { describe, expect, it } from 'vitest';

import { Frontmatter } from '../../../src/domain/wiki/frontmatter.js';

describe('Frontmatter', () => {
  it('defaults optional values', () => {
    const frontmatter = Frontmatter.create({});

    expect(frontmatter.sources).toEqual([]);
    expect(frontmatter.tags).toEqual([]);
    expect(frontmatter.conflict).toBe(false);
  });

  it('keeps collections immutable', () => {
    const frontmatter = Frontmatter.create({
      sources: [{ pageId: '1', title: 'Source', url: 'https://example.com', lastSynced: '2026-06-22T00:00:00Z' }],
      tags: ['wiki'],
      conflict: true,
    });

    expect(() => {
      (frontmatter.sources as Array<unknown>).push({});
    }).toThrow();
    expect(() => {
      (frontmatter.tags as Array<string>).push('more');
    }).toThrow();
    expect(frontmatter.conflict).toBe(true);
  });
});
