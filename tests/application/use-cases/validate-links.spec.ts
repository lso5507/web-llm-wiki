import { describe, expect, it } from 'vitest';

import type { DocumentRepository } from '../../../src/application/ports/document-repository.js';
import { ValidateLinksUseCase } from '../../../src/application/use-cases/validate-links.js';
import type { WikiDocument } from '../../../src/domain/wiki/document.js';
import type { Title } from '../../../src/domain/wiki/title.js';

class FakeDocumentRepository implements DocumentRepository {
  private readonly existing: Set<string>;
  public existsCalls: string[] = [];

  constructor(existing: string[] = []) {
    this.existing = new Set(existing);
  }

  async save(): Promise<void> {
    throw new Error('not implemented');
  }

  async findByTitle(_title: Title): Promise<WikiDocument | null> {
    return null;
  }

  async findById(): Promise<WikiDocument | null> {
    return null;
  }

  async findAll(): Promise<WikiDocument[]> {
    return [];
  }

  async delete(): Promise<void> {
    /* noop */
  }

  async exists(slug: string): Promise<boolean> {
    this.existsCalls.push(slug);
    return this.existing.has(slug);
  }
}

describe('ValidateLinksUseCase', () => {
  it('returns empty links when content has no [[slug]] references', async () => {
    const repository = new FakeDocumentRepository(['foo']);
    const useCase = new ValidateLinksUseCase(repository);

    const result = await useCase.execute({
      content: 'No links here, just plain text.',
      currentDocumentSlug: 'self',
    });

    expect(result.outbound).toEqual([]);
    expect(result.broken).toEqual([]);
    expect(repository.existsCalls).toEqual([]);
  });

  it('extracts slugs from [[slug]] references in the content', async () => {
    const repository = new FakeDocumentRepository(['foo', 'bar']);
    const useCase = new ValidateLinksUseCase(repository);

    const result = await useCase.execute({
      content: 'See [[foo]] and [[bar]] for details.',
      currentDocumentSlug: 'self',
    });

    expect(result.outbound).toEqual(['foo', 'bar']);
    expect(result.broken).toEqual([]);
  });

  it('flags slugs that do not exist as broken', async () => {
    const repository = new FakeDocumentRepository(['foo']);
    const useCase = new ValidateLinksUseCase(repository);

    const result = await useCase.execute({
      content: 'See [[foo]] and [[missing]] for details.',
      currentDocumentSlug: 'self',
    });

    expect(result.outbound).toEqual(['foo', 'missing']);
    expect(result.broken).toEqual(['missing']);
  });

  it('deduplicates repeated slugs', async () => {
    const repository = new FakeDocumentRepository(['foo']);
    const useCase = new ValidateLinksUseCase(repository);

    const result = await useCase.execute({
      content: '[[foo]] [[foo]] [[foo]]',
      currentDocumentSlug: 'self',
    });

    expect(result.outbound).toEqual(['foo']);
    expect(result.broken).toEqual([]);
    expect(repository.existsCalls).toEqual(['foo']);
  });

  it('excludes self-references from outbound and broken', async () => {
    const repository = new FakeDocumentRepository(['foo']);
    const useCase = new ValidateLinksUseCase(repository);

    const result = await useCase.execute({
      content: 'I link to [[self]] and [[foo]].',
      currentDocumentSlug: 'self',
    });

    expect(result.outbound).toEqual(['foo']);
    expect(result.broken).toEqual([]);
    expect(repository.existsCalls).toEqual(['foo']);
  });

  it('trims whitespace inside [[ slug ]] when extracting', async () => {
    const repository = new FakeDocumentRepository(['foo', 'bar baz']);
    const useCase = new ValidateLinksUseCase(repository);

    const result = await useCase.execute({
      content: 'See [[ foo ]] and [[bar baz]].',
      currentDocumentSlug: 'self',
    });

    expect(result.outbound).toEqual(['foo', 'bar baz']);
    expect(result.broken).toEqual([]);
  });

  it('preserves the order of first occurrence in outbound', async () => {
    const repository = new FakeDocumentRepository(['alpha', 'beta', 'gamma']);
    const useCase = new ValidateLinksUseCase(repository);

    const result = await useCase.execute({
      content: '[[gamma]] then [[alpha]] then [[beta]] then [[gamma]]',
      currentDocumentSlug: 'self',
    });

    expect(result.outbound).toEqual(['gamma', 'alpha', 'beta']);
  });

  it('ignores empty bracket pairs [[]]', async () => {
    const repository = new FakeDocumentRepository(['foo']);
    const useCase = new ValidateLinksUseCase(repository);

    const result = await useCase.execute({
      content: 'Empty: [[]] and a real one [[foo]].',
      currentDocumentSlug: 'self',
    });

    expect(result.outbound).toEqual(['foo']);
    expect(result.broken).toEqual([]);
  });

  it('returns empty links when content is empty', async () => {
    const repository = new FakeDocumentRepository(['foo']);
    const useCase = new ValidateLinksUseCase(repository);

    const result = await useCase.execute({
      content: '',
      currentDocumentSlug: 'self',
    });

    expect(result.outbound).toEqual([]);
    expect(result.broken).toEqual([]);
  });

  it('marks every unknown slug as broken when none exist in the repository', async () => {
    const repository = new FakeDocumentRepository([]);
    const useCase = new ValidateLinksUseCase(repository);

    const result = await useCase.execute({
      content: '[[a]] [[b]] [[c]]',
      currentDocumentSlug: 'self',
    });

    expect(result.outbound).toEqual(['a', 'b', 'c']);
    expect(result.broken).toEqual(['a', 'b', 'c']);
  });
});
