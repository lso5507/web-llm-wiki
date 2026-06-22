import { describe, expect, it } from 'vitest';

import { InMemoryDocumentRepository } from '../../../src/infrastructure/persistence/in-memory/in-memory-document-repository.js';
import { WikiDocument } from '../../../src/domain/wiki/document.js';
import { Frontmatter } from '../../../src/domain/wiki/frontmatter.js';
import { Title } from '../../../src/domain/wiki/title.js';

describe('InMemoryDocumentRepository', () => {
  it('saves and overwrites by title slug', async () => {
    const repository = new InMemoryDocumentRepository();

    await repository.save(
      WikiDocument.create({ title: Title.create('Foo'), frontmatter: Frontmatter.create({}), content: 'old' }),
    );
    await repository.save(
      WikiDocument.create({ title: Title.create('Foo'), frontmatter: Frontmatter.create({}), content: 'new' }),
    );

    expect((await repository.findByTitle(Title.create('Foo')))?.content).toBe('new');
  });
});
