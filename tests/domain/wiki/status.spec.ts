import { describe, expect, it } from 'vitest';

import { InvalidStatusError, Status } from '../../../src/domain/wiki/status.js';

describe('Status', () => {
  it('creates a status from valid values', () => {
    expect(Status.from('draft').value).toBe('draft');
    expect(Status.from('review').value).toBe('review');
    expect(Status.from('published').value).toBe('published');
  });

  it('rejects invalid status strings', () => {
    expect(() => Status.from('archived')).toThrow(InvalidStatusError);
    expect(() => Status.from('')).toThrow(InvalidStatusError);
    expect(() => Status.from('Draft')).toThrow(InvalidStatusError);
    expect(() => Status.from('PUBLISHED')).toThrow(InvalidStatusError);
  });

  it('exposes a descriptive error message listing the allowed values', () => {
    expect(() => Status.from('archived')).toThrow(/draft.*review.*published/);
  });

  it('supports equality by value', () => {
    expect(Status.from('draft').equals(Status.from('draft'))).toBe(true);
    expect(Status.from('draft').equals(Status.from('review'))).toBe(false);
  });

  it('is immutable', () => {
    const status = Status.from('draft');
    expect(Object.isFrozen(status)).toBe(true);
    expect(() => {
      (status as { value: string }).value = 'review';
    }).toThrow();
    expect(status.value).toBe('draft');
  });
});
