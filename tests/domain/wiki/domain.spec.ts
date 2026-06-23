import { describe, expect, it } from 'vitest';

import { Domain, InvalidDomainError } from '../../../src/domain/wiki/domain.js';

describe('Domain', () => {
  it('creates a domain from a valid kebab-case value', () => {
    expect(Domain.from('tech-stack').value).toBe('tech-stack');
    expect(Domain.from('project-mgmt').value).toBe('project-mgmt');
    expect(Domain.from('api-design').value).toBe('api-design');
  });

  it('accepts a single-segment kebab-case value', () => {
    expect(Domain.from('orenz').value).toBe('orenz');
    expect(Domain.from('wiki').value).toBe('wiki');
  });

  it('accepts alphanumerics inside segments', () => {
    expect(Domain.from('v2-api').value).toBe('v2-api');
    expect(Domain.from('http2-stack').value).toBe('http2-stack');
  });

  it('rejects empty domain values', () => {
    expect(() => Domain.from('')).toThrow(InvalidDomainError);
    expect(() => Domain.from('   ')).toThrow(InvalidDomainError);
  });

  it('rejects non kebab-case values', () => {
    expect(() => Domain.from('TechStack')).toThrow(InvalidDomainError);
    expect(() => Domain.from('tech_stack')).toThrow(InvalidDomainError);
    expect(() => Domain.from('tech stack')).toThrow(InvalidDomainError);
    expect(() => Domain.from('Tech-Stack')).toThrow(InvalidDomainError);
  });

  it('rejects malformed kebab-case patterns', () => {
    expect(() => Domain.from('-tech')).toThrow(InvalidDomainError);
    expect(() => Domain.from('tech-')).toThrow(InvalidDomainError);
    expect(() => Domain.from('tech--stack')).toThrow(InvalidDomainError);
    expect(() => Domain.from('-')).toThrow(InvalidDomainError);
  });

  it('supports equality by value', () => {
    expect(Domain.from('tech-stack').equals(Domain.from('tech-stack'))).toBe(true);
    expect(Domain.from('tech-stack').equals(Domain.from('api-design'))).toBe(false);
  });

  it('is immutable', () => {
    const domain = Domain.from('tech-stack');
    expect(Object.isFrozen(domain)).toBe(true);
    expect(() => {
      (domain as { value: string }).value = 'mutated';
    }).toThrow();
    expect(domain.value).toBe('tech-stack');
  });
});
