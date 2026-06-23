import { describe, expect, it } from 'vitest';

import { Frontmatter } from '../../../src/domain/wiki/frontmatter.js';

describe('Frontmatter', () => {
  it('defaults optional values', () => {
    const frontmatter = Frontmatter.create({});

    expect(frontmatter.sources).toEqual([]);
    expect(frontmatter.tags).toEqual([]);
    expect(frontmatter.conflict).toBe(false);
    expect(frontmatter.parent).toBeNull();
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

  describe('parent', () => {
    it('stores the parent slug when provided', () => {
      const frontmatter = Frontmatter.create({ parent: 'my-parent' });
      expect(frontmatter.parent).toBe('my-parent');
    });

    it('treats undefined parent as null', () => {
      const frontmatter = Frontmatter.create({});
      expect(frontmatter.parent).toBeNull();
    });

    it('treats null parent as null', () => {
      const frontmatter = Frontmatter.create({ parent: null });
      expect(frontmatter.parent).toBeNull();
    });

    it('trims whitespace and treats empty parent as null', () => {
      const frontmatter = Frontmatter.create({ parent: '   ' });
      expect(frontmatter.parent).toBeNull();
    });

    it('trims surrounding whitespace from parent slug', () => {
      const frontmatter = Frontmatter.create({ parent: '  my-parent  ' });
      expect(frontmatter.parent).toBe('my-parent');
    });
  });
});
