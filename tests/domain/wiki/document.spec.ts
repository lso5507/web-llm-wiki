import { describe, expect, it } from 'vitest';

import { DocumentLinks } from '../../../src/domain/wiki/document-links.js';
import { DocumentMetadata } from '../../../src/domain/wiki/document-metadata.js';
import { WikiDocument } from '../../../src/domain/wiki/document.js';
import { Frontmatter } from '../../../src/domain/wiki/frontmatter.js';
import { Title } from '../../../src/domain/wiki/title.js';

describe('WikiDocument', () => {
  it('creates a document and projects it to an index entry', () => {
    const document = WikiDocument.create({
      title: Title.create('Orenz Test Account'),
      content: '# Content',
      tags: ['orenz'],
    });

    const entry = document.toIndexEntry('Test account credentials');

    expect(document.title.value).toBe('Orenz Test Account');
    expect(document.frontmatter.tags).toEqual(['orenz']);
    expect(entry.title).toBe('Orenz Test Account');
    expect(entry.summary).toBe('Test account credentials');
  });

  it('still accepts the legacy frontmatter parameter for backward compatibility', () => {
    const document = WikiDocument.create({
      title: Title.create('Orenz Test Account'),
      frontmatter: Frontmatter.create({ tags: ['orenz'] }),
      content: '# Content',
    });

    expect(document.frontmatter.tags).toEqual(['orenz']);
    expect(document.metadata.tags).toEqual(['orenz']);
  });

  it('uses default DocumentMetadata when none is provided', () => {
    const document = WikiDocument.create({
      title: Title.create('Untitled'),
      content: 'body',
    });

    expect(document.metadata.status.value).toBe('draft');
    expect(document.metadata.domain).toBeNull();
    expect(document.metadata.tags).toEqual([]);
    expect(document.metadata.conflict).toBe(false);
    expect(document.metadata.conflictWith).toEqual([]);
  });

  it('integrates the provided metadata', () => {
    const metadata = DocumentMetadata.from({
      status: 'review',
      domain: 'tech-stack',
      tags: ['react', 'typescript'],
      conflict: true,
      conflictWith: ['doc-1', 'doc-2'],
    });

    const document = WikiDocument.create({
      title: Title.create('Test'),
      content: 'body',
      metadata,
    });

    expect(document.metadata.status.value).toBe('review');
    expect(document.metadata.domain?.value).toBe('tech-stack');
    expect(document.metadata.tags).toEqual(['react', 'typescript']);
    expect(document.metadata.conflict).toBe(true);
    expect(document.metadata.conflictWith).toEqual(['doc-1', 'doc-2']);
  });

  it('mirrors metadata.tags and metadata.conflict into frontmatter', () => {
    const metadata = DocumentMetadata.from({
      tags: ['a', 'b'],
      conflict: true,
    });

    const document = WikiDocument.create({
      title: Title.create('Test'),
      content: 'body',
      metadata,
    });

    expect(document.frontmatter.tags).toEqual(['a', 'b']);
    expect(document.frontmatter.conflict).toBe(true);
  });

  it('exposes getter accessors that read through metadata', () => {
    const document = WikiDocument.create({
      title: Title.create('Test'),
      content: 'body',
      tags: ['foo'],
    });

    expect(document.getStatus().value).toBe('draft');
    expect(document.getDomain()).toBeNull();
    expect(document.getTags()).toEqual(['foo']);
  });

  it('returns the configured Status and Domain through getters', () => {
    const document = WikiDocument.create({
      title: Title.create('Test'),
      content: 'body',
      metadata: DocumentMetadata.from({
        status: 'published',
        domain: 'observability',
      }),
    });

    expect(document.getStatus().value).toBe('published');
    expect(document.getDomain()?.value).toBe('observability');
  });

  it('promotes tags into metadata when only the tags shortcut is provided', () => {
    const document = WikiDocument.create({
      title: Title.create('Test'),
      content: 'body',
      tags: ['shortcut-tag'],
    });

    expect(document.metadata.tags).toEqual(['shortcut-tag']);
    expect(document.frontmatter.tags).toEqual(['shortcut-tag']);
  });

  it('keeps the document instance immutable', () => {
    const document = WikiDocument.create({
      title: Title.create('Test'),
      content: 'body',
    });

    expect(Object.isFrozen(document)).toBe(true);
  });

  it('forwards sources into the frontmatter for index projection', () => {
    const document = WikiDocument.create({
      title: Title.create('With Sources'),
      content: 'body',
      sources: [
        {
          pageId: '111',
          title: 'src',
          url: 'https://example.com/111',
          lastSynced: '2026-01-01T00:00:00Z',
        },
      ],
    });

    const entry = document.toIndexEntry('summary');

    expect(document.frontmatter.sources).toHaveLength(1);
    expect(entry.sourceCount).toBe(1);
  });

  describe('links', () => {
    it('defaults links to an empty DocumentLinks when none are provided', () => {
      const document = WikiDocument.create({
        title: Title.create('No Links'),
        content: 'body',
      });

      expect(document.links.outbound).toEqual([]);
      expect(document.links.broken).toEqual([]);
    });

    it('stores the provided DocumentLinks value object', () => {
      const links = DocumentLinks.from({
        outbound: ['foo', 'bar'],
        broken: ['bar'],
      });

      const document = WikiDocument.create({
        title: Title.create('With Links'),
        content: 'See [[foo]] and [[bar]]',
        links,
      });

      expect(document.links.outbound).toEqual(['foo', 'bar']);
      expect(document.links.broken).toEqual(['bar']);
    });
  });

  describe('parentSlug', () => {
    it('defaults parentSlug to null when none is provided', () => {
      const document = WikiDocument.create({
        title: Title.create('Root Doc'),
        content: 'body',
      });

      expect(document.parentSlug).toBeNull();
      expect(document.frontmatter.parent).toBeNull();
    });

    it('stores parentSlug from input', () => {
      const document = WikiDocument.create({
        title: Title.create('Child Doc'),
        content: 'body',
        parentSlug: 'parent-doc',
      });

      expect(document.parentSlug).toBe('parent-doc');
      expect(document.frontmatter.parent).toBe('parent-doc');
    });

    it('reads parentSlug from frontmatter when input.parentSlug is undefined', () => {
      const frontmatter = Frontmatter.create({ parent: 'parent-from-fm' });
      const document = WikiDocument.create({
        title: Title.create('Doc'),
        frontmatter,
        content: 'body',
      });

      expect(document.parentSlug).toBe('parent-from-fm');
    });

    it('treats explicit null parentSlug as null', () => {
      const document = WikiDocument.create({
        title: Title.create('Doc'),
        content: 'body',
        parentSlug: null,
      });

      expect(document.parentSlug).toBeNull();
    });

    it('trims whitespace and treats empty strings as null', () => {
      const document = WikiDocument.create({
        title: Title.create('Doc'),
        content: 'body',
        parentSlug: '   ',
      });

      expect(document.parentSlug).toBeNull();
    });
  });

  describe('withParent', () => {
    it('returns a new document with the provided parentSlug', () => {
      const document = WikiDocument.create({
        title: Title.create('Doc'),
        content: 'body',
      });

      const updated = document.withParent('new-parent');

      expect(updated.parentSlug).toBe('new-parent');
      expect(updated.frontmatter.parent).toBe('new-parent');
      expect(document.parentSlug).toBeNull();
    });

    it('returns a new document with parentSlug cleared when null is passed', () => {
      const document = WikiDocument.create({
        title: Title.create('Doc'),
        content: 'body',
        parentSlug: 'old-parent',
      });

      const updated = document.withParent(null);

      expect(updated.parentSlug).toBeNull();
      expect(updated.frontmatter.parent).toBeNull();
    });

    it('preserves title, content, links, metadata, and tags', () => {
      const links = DocumentLinks.from({ outbound: ['a'], broken: [] });
      const document = WikiDocument.create({
        title: Title.create('Doc'),
        content: 'See [[a]].',
        tags: ['t1'],
        links,
      });

      const updated = document.withParent('parent');

      expect(updated.title.value).toBe('Doc');
      expect(updated.content).toBe('See [[a]].');
      expect(updated.metadata.tags).toEqual(['t1']);
      expect(updated.links.outbound).toEqual(['a']);
    });

    it('returns the same instance when parent is unchanged', () => {
      const document = WikiDocument.create({
        title: Title.create('Doc'),
        content: 'body',
        parentSlug: 'parent',
      });

      const updated = document.withParent('parent');

      expect(updated).toBe(document);
    });
  });
});
