import { describe, expect, it } from 'vitest';

import { DocumentLinks } from '../../../src/domain/wiki/document-links.js';

describe('DocumentLinks', () => {
  it('creates an empty links value object by default', () => {
    const links = DocumentLinks.empty();

    expect(links.outbound).toEqual([]);
    expect(links.broken).toEqual([]);
  });

  it('creates a links value object from explicit lists', () => {
    const links = DocumentLinks.from({
      outbound: ['foo', 'bar'],
      broken: ['bar'],
    });

    expect(links.outbound).toEqual(['foo', 'bar']);
    expect(links.broken).toEqual(['bar']);
  });

  it('defaults missing fields to empty arrays', () => {
    const links = DocumentLinks.from({});

    expect(links.outbound).toEqual([]);
    expect(links.broken).toEqual([]);
  });

  it('is immutable: outbound and broken arrays are frozen', () => {
    const links = DocumentLinks.from({
      outbound: ['foo'],
      broken: ['bar'],
    });

    expect(Object.isFrozen(links)).toBe(true);
    expect(Object.isFrozen(links.outbound)).toBe(true);
    expect(Object.isFrozen(links.broken)).toBe(true);
  });

  it('does not share references with input arrays (defensive copy)', () => {
    const outbound = ['foo'];
    const broken = ['bar'];

    const links = DocumentLinks.from({ outbound, broken });

    outbound.push('mutated');
    broken.push('mutated');

    expect(links.outbound).toEqual(['foo']);
    expect(links.broken).toEqual(['bar']);
  });

  it('rejects non-string entries in outbound', () => {
    expect(() =>
      DocumentLinks.from({
        outbound: ['foo', '' as string],
        broken: [],
      }),
    ).toThrow(/outbound/);
  });

  it('rejects non-string entries in broken', () => {
    expect(() =>
      DocumentLinks.from({
        outbound: [],
        broken: ['  '],
      }),
    ).toThrow(/broken/);
  });

  it('hasBroken returns true when broken is non-empty', () => {
    const withBroken = DocumentLinks.from({
      outbound: ['foo'],
      broken: ['foo'],
    });
    const empty = DocumentLinks.empty();

    expect(withBroken.hasBroken()).toBe(true);
    expect(empty.hasBroken()).toBe(false);
  });
});
