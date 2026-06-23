import { describe, expect, it } from 'vitest';

import type { DocumentRepository } from '../../../src/application/ports/document-repository.js';
import { SuggestLinksUseCase } from '../../../src/application/use-cases/suggest-links.js';
import { WikiDocument } from '../../../src/domain/wiki/document.js';
import { Title } from '../../../src/domain/wiki/title.js';

class FakeDocumentRepository implements DocumentRepository {
  constructor(private readonly documents: WikiDocument[] = []) {}

  async save(): Promise<void> {
    throw new Error('not implemented');
  }

  async findByTitle(): Promise<WikiDocument | null> {
    return null;
  }

  async findById(): Promise<WikiDocument | null> {
    return null;
  }

  async findAll(): Promise<WikiDocument[]> {
    return [...this.documents];
  }

  async delete(): Promise<void> {
    /* noop */
  }

  async exists(): Promise<boolean> {
    return false;
  }
}

const makeDoc = (title: string): WikiDocument =>
  WikiDocument.create({ title: Title.create(title), content: '' });

describe('SuggestLinksUseCase', () => {
  it('returns content unchanged when content is empty', async () => {
    const repository = new FakeDocumentRepository([makeDoc('Foo')]);
    const useCase = new SuggestLinksUseCase(repository);

    const result = await useCase.execute({
      content: '',
      currentDocumentSlug: 'self',
    });

    expect(result.content).toBe('');
    expect(result.linksAdded).toBe(0);
  });

  it('returns content unchanged when no other documents exist', async () => {
    const repository = new FakeDocumentRepository([]);
    const useCase = new SuggestLinksUseCase(repository);

    const result = await useCase.execute({
      content: 'Hello world',
      currentDocumentSlug: 'self',
    });

    expect(result.content).toBe('Hello world');
    expect(result.linksAdded).toBe(0);
  });

  it('replaces a single title occurrence with [[slug]]', async () => {
    const repository = new FakeDocumentRepository([makeDoc('Foo Bar')]);
    const useCase = new SuggestLinksUseCase(repository);

    const result = await useCase.execute({
      content: 'Check out Foo Bar today',
      currentDocumentSlug: 'self',
    });

    expect(result.content).toBe('Check out [[foo-bar]] today');
    expect(result.linksAdded).toBe(1);
  });

  it('replaces multiple occurrences of the same title', async () => {
    const repository = new FakeDocumentRepository([makeDoc('Foo')]);
    const useCase = new SuggestLinksUseCase(repository);

    const result = await useCase.execute({
      content: 'Foo and Foo and Foo',
      currentDocumentSlug: 'self',
    });

    expect(result.content).toBe('[[foo]] and [[foo]] and [[foo]]');
    expect(result.linksAdded).toBe(3);
  });

  it('matches case-insensitively', async () => {
    const repository = new FakeDocumentRepository([makeDoc('Foo')]);
    const useCase = new SuggestLinksUseCase(repository);

    const result = await useCase.execute({
      content: 'foo and FOO and Foo',
      currentDocumentSlug: 'self',
    });

    expect(result.content).toBe('[[foo]] and [[foo]] and [[foo]]');
    expect(result.linksAdded).toBe(3);
  });

  it('respects word boundaries (Foober is not Foo)', async () => {
    const repository = new FakeDocumentRepository([makeDoc('Foo')]);
    const useCase = new SuggestLinksUseCase(repository);

    const result = await useCase.execute({
      content: 'Foober and barFoo are unrelated',
      currentDocumentSlug: 'self',
    });

    expect(result.content).toBe('Foober and barFoo are unrelated');
    expect(result.linksAdded).toBe(0);
  });

  it('skips occurrences already inside existing [[...]] links', async () => {
    const repository = new FakeDocumentRepository([makeDoc('Foo')]);
    const useCase = new SuggestLinksUseCase(repository);

    const result = await useCase.execute({
      content: 'Already linked: [[foo]] but here is unlinked: Foo',
      currentDocumentSlug: 'self',
    });

    expect(result.content).toBe(
      'Already linked: [[foo]] but here is unlinked: [[foo]]',
    );
    expect(result.linksAdded).toBe(1);
  });

  it('skips when title text appears inside an existing link with a different slug', async () => {
    const repository = new FakeDocumentRepository([makeDoc('Foo')]);
    const useCase = new SuggestLinksUseCase(repository);

    const result = await useCase.execute({
      content: 'See [[some-other Foo link]] should remain untouched',
      currentDocumentSlug: 'self',
    });

    expect(result.content).toBe(
      'See [[some-other Foo link]] should remain untouched',
    );
    expect(result.linksAdded).toBe(0);
  });

  it('excludes self from suggestions even when title appears in content', async () => {
    const repository = new FakeDocumentRepository([makeDoc('Self Page')]);
    const useCase = new SuggestLinksUseCase(repository);

    const result = await useCase.execute({
      content: 'I am Self Page and that is fine',
      currentDocumentSlug: 'self-page',
    });

    expect(result.content).toBe('I am Self Page and that is fine');
    expect(result.linksAdded).toBe(0);
  });

  it('processes longer titles before shorter ones to avoid partial matches', async () => {
    const repository = new FakeDocumentRepository([
      makeDoc('Foo'),
      makeDoc('Foo Bar'),
    ]);
    const useCase = new SuggestLinksUseCase(repository);

    const result = await useCase.execute({
      content: 'See Foo Bar in action',
      currentDocumentSlug: 'self',
    });

    expect(result.content).toBe('See [[foo-bar]] in action');
    expect(result.linksAdded).toBe(1);
  });

  it('replaces both longer and shorter titles when each appears separately', async () => {
    const repository = new FakeDocumentRepository([
      makeDoc('Foo'),
      makeDoc('Foo Bar'),
    ]);
    const useCase = new SuggestLinksUseCase(repository);

    const result = await useCase.execute({
      content: 'Foo Bar and standalone Foo are different',
      currentDocumentSlug: 'self',
    });

    expect(result.content).toBe(
      '[[foo-bar]] and standalone [[foo]] are different',
    );
    expect(result.linksAdded).toBe(2);
  });

  it('replaces multiple distinct titles in the content', async () => {
    const repository = new FakeDocumentRepository([
      makeDoc('Apple'),
      makeDoc('Banana'),
    ]);
    const useCase = new SuggestLinksUseCase(repository);

    const result = await useCase.execute({
      content: 'Apple and Banana are fruits',
      currentDocumentSlug: 'self',
    });

    expect(result.content).toBe('[[apple]] and [[banana]] are fruits');
    expect(result.linksAdded).toBe(2);
  });

  it('does not double-link when a long title contains another title as substring', async () => {
    const repository = new FakeDocumentRepository([
      makeDoc('Bar'),
      makeDoc('Foo Bar'),
    ]);
    const useCase = new SuggestLinksUseCase(repository);

    const result = await useCase.execute({
      content: 'Foo Bar and Bar alone',
      currentDocumentSlug: 'self',
    });

    expect(result.content).toBe('[[foo-bar]] and [[bar]] alone');
    expect(result.linksAdded).toBe(2);
  });

  it('returns content unchanged when no titles match', async () => {
    const repository = new FakeDocumentRepository([
      makeDoc('Apple'),
      makeDoc('Banana'),
    ]);
    const useCase = new SuggestLinksUseCase(repository);

    const result = await useCase.execute({
      content: 'No fruits mentioned here at all.',
      currentDocumentSlug: 'self',
    });

    expect(result.content).toBe('No fruits mentioned here at all.');
    expect(result.linksAdded).toBe(0);
  });

  it('safely handles titles with regex special characters', async () => {
    const repository = new FakeDocumentRepository([makeDoc('Hello.World')]);
    const useCase = new SuggestLinksUseCase(repository);

    const result = await useCase.execute({
      content: 'plain HelloXWorld text',
      currentDocumentSlug: 'self',
    });

    // Title 'Hello.World' must be treated literally, not as regex.
    // 'HelloXWorld' should NOT match because '.' is escaped and only
    // matches a literal dot.
    expect(result.content).toBe('plain HelloXWorld text');
    expect(result.linksAdded).toBe(0);
  });

  it('does not modify content that is fully inside [[...]] regions', async () => {
    const repository = new FakeDocumentRepository([makeDoc('Foo')]);
    const useCase = new SuggestLinksUseCase(repository);

    const result = await useCase.execute({
      content: '[[Foo]]',
      currentDocumentSlug: 'self',
    });

    expect(result.content).toBe('[[Foo]]');
    expect(result.linksAdded).toBe(0);
  });
});
