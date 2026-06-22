import { describe, expect, it } from 'vitest';

import { WikiDocument } from '../../../src/domain/wiki/document.js';
import { Frontmatter } from '../../../src/domain/wiki/frontmatter.js';
import { Title } from '../../../src/domain/wiki/title.js';

describe('WikiDocument', () => {
  it('creates a document and projects it to an index entry', () => {
    const document = WikiDocument.create({
      title: Title.create('Orenz Test Account'),
      frontmatter: Frontmatter.create({ tags: ['orenz'] }),
      content: '# Content',
    });

    const entry = document.toIndexEntry('Test account credentials');

    expect(document.title.value).toBe('Orenz Test Account');
    expect(document.frontmatter.tags).toEqual(['orenz']);
    expect(entry.title).toBe('Orenz Test Account');
    expect(entry.summary).toBe('Test account credentials');
  });
});
