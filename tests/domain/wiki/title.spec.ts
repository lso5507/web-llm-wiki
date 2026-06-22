import { describe, expect, it } from 'vitest';

import { InvalidTitleError, Title } from '../../../src/domain/wiki/title.js';

describe('Title', () => {
  it('rejects an empty title', () => {
    expect(() => Title.create('')).toThrow(InvalidTitleError);
    expect(() => Title.create('   ')).toThrow('Title must not be empty');
  });

  it('preserves the original value and supports equality by value', () => {
    const title = Title.create('Orenz Test Account');

    expect(title.value).toBe('Orenz Test Account');
    expect(title.equals(Title.create('Orenz Test Account'))).toBe(true);
    expect(title.equals(Title.create('Other'))).toBe(false);
  });

  it('creates a deterministic slug', () => {
    expect(Title.create('Orenz Test Account').toSlug()).toBe('orenz-test-account');
    expect(Title.create('  Foo   Bar  Baz ').toSlug()).toBe('foo-bar-baz');
  });
});
