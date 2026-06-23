import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FileSystemDocumentRepository } from '../../../../src/infrastructure/persistence/filesystem/file-system-document-repository.js';
import { DocumentLinks } from '../../../../src/domain/wiki/document-links.js';
import { DocumentMetadata } from '../../../../src/domain/wiki/document-metadata.js';
import { WikiDocument } from '../../../../src/domain/wiki/document.js';
import { Frontmatter } from '../../../../src/domain/wiki/frontmatter.js';
import { Title } from '../../../../src/domain/wiki/title.js';

const createTempDir = (): string =>
  mkdtempSync(join(tmpdir(), 'web-llm-wiki-doc-repo-'));

describe('FileSystemDocumentRepository', () => {
  let dataRoot: string;

  beforeEach(() => {
    dataRoot = createTempDir();
  });

  afterEach(() => {
    rmSync(dataRoot, { recursive: true, force: true });
  });

  it('writes a markdown file under {DATA_ROOT}/wiki named after the title slug', async () => {
    const repository = new FileSystemDocumentRepository(dataRoot);

    await repository.save(
      WikiDocument.create({
        title: Title.create('Orenz Test Account'),
        frontmatter: Frontmatter.create({}),
        content: 'body',
      }),
    );

    const expectedPath = join(dataRoot, 'wiki', 'orenz-test-account.md');
    const fileContent = readFileSync(expectedPath, 'utf8');

    expect(fileContent.startsWith('---\n')).toBe(true);
    expect(fileContent).toMatch(/title: ['"]?Orenz Test Account['"]?/);
    expect(fileContent).toContain('conflict: false');
    expect(fileContent.trimEnd().endsWith('body')).toBe(true);
  });

  it('auto-creates the wiki directory when it does not exist yet', async () => {
    const nestedRoot = join(dataRoot, 'deeper', 'nested');
    const repository = new FileSystemDocumentRepository(nestedRoot);

    await repository.save(
      WikiDocument.create({
        title: Title.create('Foo'),
        frontmatter: Frontmatter.create({}),
        content: 'hello',
      }),
    );

    const fileContent = await readFile(
      join(nestedRoot, 'wiki', 'foo.md'),
      'utf8',
    );
    expect(fileContent).toContain('hello');
  });

  it('serializes tags, sources and conflict flag into the YAML frontmatter', async () => {
    const repository = new FileSystemDocumentRepository(dataRoot);

    await repository.save(
      WikiDocument.create({
        title: Title.create('Spec Doc'),
        frontmatter: Frontmatter.create({
          tags: ['orenz', 'wiki'],
          sources: [
            {
              pageId: '12345',
              title: 'Confluence Source',
              url: 'https://example.com/12345',
              lastSynced: '2026-05-14T10:00:00Z',
            },
          ],
          conflict: true,
        }),
        content: 'spec body',
      }),
    );

    const fileContent = await readFile(
      join(dataRoot, 'wiki', 'spec-doc.md'),
      'utf8',
    );

    expect(fileContent).toContain('tags:');
    expect(fileContent).toContain('orenz');
    expect(fileContent).toContain('wiki');
    expect(fileContent).toContain('conflict: true');
    expect(fileContent).toContain('pageId:');
    expect(fileContent).toContain('Confluence Source');
    expect(fileContent).toContain('https://example.com/12345');
  });

  it('serializes the full DocumentMetadata into the YAML frontmatter', async () => {
    const repository = new FileSystemDocumentRepository(dataRoot);

    await repository.save(
      WikiDocument.create({
        title: Title.create('Metadata Doc'),
        content: 'meta body',
        sources: [],
        metadata: DocumentMetadata.from({
          status: 'review',
          domain: 'tech-stack',
          tags: ['alpha', 'beta'],
          conflict: true,
          conflictWith: ['doc-foo', 'doc-bar'],
        }),
      }),
    );

    const fileContent = await readFile(
      join(dataRoot, 'wiki', 'metadata-doc.md'),
      'utf8',
    );

    expect(fileContent).toContain('status: review');
    expect(fileContent).toContain('domain: tech-stack');
    expect(fileContent).toContain('alpha');
    expect(fileContent).toContain('beta');
    expect(fileContent).toContain('conflict: true');
    expect(fileContent).toContain('conflictWith:');
    expect(fileContent).toContain('doc-foo');
    expect(fileContent).toContain('doc-bar');
    expect(fileContent).toContain('semanticConflicts:');
  });

  it('round-trips semantic conflict metadata through save and findByTitle', async () => {
    const repository = new FileSystemDocumentRepository(dataRoot);

    await repository.save(
      WikiDocument.create({
        title: Title.create('Semantic Conflict Doc'),
        content: 'Korea shipping fee is 3000 KRW',
        metadata: DocumentMetadata.from({
          domain: 'shipping',
          semanticConflicts: [
            {
              conflictingDocumentSlug: 'shipping-policy',
              conflictingDocumentTitle: 'Shipping Policy',
              explanation: 'Korea shipping fee differs.',
              confidence: 'high',
            },
          ],
        }),
      }),
    );

    const reloaded = await repository.findByTitle(Title.create('Semantic Conflict Doc'));

    expect(reloaded?.metadata.semanticConflicts).toEqual([
      {
        conflictingDocumentSlug: 'shipping-policy',
        conflictingDocumentTitle: 'Shipping Policy',
        explanation: 'Korea shipping fee differs.',
        confidence: 'high',
      },
    ]);
  });

  it('writes default status, null domain and empty conflictWith when no metadata is provided', async () => {
    const repository = new FileSystemDocumentRepository(dataRoot);

    await repository.save(
      WikiDocument.create({
        title: Title.create('Defaults Doc'),
        content: 'body',
      }),
    );

    const fileContent = await readFile(
      join(dataRoot, 'wiki', 'defaults-doc.md'),
      'utf8',
    );

    expect(fileContent).toContain('status: draft');
    expect(fileContent).toMatch(/domain:\s*(null|~|''|"")/);
    expect(fileContent).toContain('conflict: false');
    expect(fileContent).toMatch(/conflictWith:\s*(\[\]|$)/m);
  });

  it('overwrites the existing file when saving the same title twice', async () => {
    const repository = new FileSystemDocumentRepository(dataRoot);

    await repository.save(
      WikiDocument.create({
        title: Title.create('Foo'),
        frontmatter: Frontmatter.create({}),
        content: 'old',
      }),
    );
    await repository.save(
      WikiDocument.create({
        title: Title.create('Foo'),
        frontmatter: Frontmatter.create({}),
        content: 'new',
      }),
    );

    const reloaded = await repository.findByTitle(Title.create('Foo'));
    expect(reloaded?.content).toBe('new');
  });

  it('returns null from findByTitle when no file exists for the title', async () => {
    const repository = new FileSystemDocumentRepository(dataRoot);

    const result = await repository.findByTitle(Title.create('Missing'));

    expect(result).toBeNull();
  });

  it('round-trips a document through save and findByTitle', async () => {
    const repository = new FileSystemDocumentRepository(dataRoot);

    await repository.save(
      WikiDocument.create({
        title: Title.create('Round Trip'),
        frontmatter: Frontmatter.create({
          tags: ['t1', 't2'],
          sources: [
            {
              pageId: '999',
              title: 'src',
              url: 'https://example.com/999',
              lastSynced: '2026-01-01T00:00:00Z',
            },
          ],
          conflict: false,
        }),
        content: '# Heading\n\nbody text',
      }),
    );

    const reloaded = await repository.findByTitle(Title.create('Round Trip'));

    expect(reloaded).not.toBeNull();
    expect(reloaded?.title.value).toBe('Round Trip');
    expect(reloaded?.content).toBe('# Heading\n\nbody text');
    expect(reloaded?.frontmatter.tags).toEqual(['t1', 't2']);
    expect(reloaded?.frontmatter.sources).toEqual([
      {
        pageId: '999',
        title: 'src',
        url: 'https://example.com/999',
        lastSynced: '2026-01-01T00:00:00Z',
      },
    ]);
    expect(reloaded?.frontmatter.conflict).toBe(false);
  });

  it('round-trips the full DocumentMetadata through save and findByTitle', async () => {
    const repository = new FileSystemDocumentRepository(dataRoot);

    await repository.save(
      WikiDocument.create({
        title: Title.create('Metadata Round Trip'),
        content: '# Heading\n\nbody',
        sources: [
          {
            pageId: '777',
            title: 'meta-src',
            url: 'https://example.com/777',
            lastSynced: '2026-02-02T00:00:00Z',
          },
        ],
        metadata: DocumentMetadata.from({
          status: 'review',
          domain: 'tech-stack',
          tags: ['react', 'ddd'],
          conflict: true,
          conflictWith: ['doc-1'],
        }),
      }),
    );

    const reloaded = await repository.findByTitle(Title.create('Metadata Round Trip'));

    expect(reloaded).not.toBeNull();
    expect(reloaded?.metadata.status.value).toBe('review');
    expect(reloaded?.metadata.domain?.value).toBe('tech-stack');
    expect(reloaded?.metadata.tags).toEqual(['react', 'ddd']);
    expect(reloaded?.metadata.conflict).toBe(true);
    expect(reloaded?.metadata.conflictWith).toEqual(['doc-1']);
    expect(reloaded?.frontmatter.sources).toEqual([
      {
        pageId: '777',
        title: 'meta-src',
        url: 'https://example.com/777',
        lastSynced: '2026-02-02T00:00:00Z',
      },
    ]);
  });

  it('falls back to default metadata when legacy YAML frontmatter omits the new fields', async () => {
    const wikiDir = join(dataRoot, 'wiki');
    await mkdir(wikiDir, { recursive: true });
    const legacyContent = `---\ntitle: Legacy Doc\ntags:\n  - legacy\nsources: []\nconflict: false\n---\n\nlegacy body`;
    await (await import('node:fs/promises')).writeFile(
      join(wikiDir, 'legacy-doc.md'),
      legacyContent,
      'utf8',
    );

    const repository = new FileSystemDocumentRepository(dataRoot);
    const reloaded = await repository.findByTitle(Title.create('Legacy Doc'));

    expect(reloaded).not.toBeNull();
    expect(reloaded?.metadata.status.value).toBe('draft');
    expect(reloaded?.metadata.domain).toBeNull();
    expect(reloaded?.metadata.tags).toEqual(['legacy']);
    expect(reloaded?.metadata.conflict).toBe(false);
    expect(reloaded?.metadata.conflictWith).toEqual([]);
    expect(reloaded?.content).toBe('legacy body');
  });

  it('returns null when the existing file is malformed and cannot be parsed', async () => {
    const wikiDir = join(dataRoot, 'wiki');
    await mkdir(wikiDir, { recursive: true });
    const malformedPath = join(wikiDir, 'broken.md');
    await (await import('node:fs/promises')).writeFile(
      malformedPath,
      'not a yaml frontmatter file',
      'utf8',
    );

    const repository = new FileSystemDocumentRepository(dataRoot);
    const result = await repository.findByTitle(Title.create('broken'));

    expect(result).toBeNull();
  });

  describe('exists', () => {
    it('returns true when a document with the given slug exists on disk', async () => {
      const repository = new FileSystemDocumentRepository(dataRoot);
      await repository.save(
        WikiDocument.create({
          title: Title.create('Foo Bar'),
          frontmatter: Frontmatter.create({}),
          content: 'body',
        }),
      );

      expect(await repository.exists('foo-bar')).toBe(true);
    });

    it('returns false when no document with the given slug exists', async () => {
      const repository = new FileSystemDocumentRepository(dataRoot);

      expect(await repository.exists('missing')).toBe(false);
    });

    it('returns false when the wiki directory does not exist', async () => {
      const nestedRoot = join(dataRoot, 'never-created');
      const repository = new FileSystemDocumentRepository(nestedRoot);

      expect(await repository.exists('anything')).toBe(false);
    });
  });

  describe('links serialization', () => {
    it('serializes outbound and broken into the YAML frontmatter', async () => {
      const repository = new FileSystemDocumentRepository(dataRoot);

      await repository.save(
        WikiDocument.create({
          title: Title.create('Linked Doc'),
          content: 'See [[foo]] and [[missing]].',
          links: DocumentLinks.from({
            outbound: ['foo', 'missing'],
            broken: ['missing'],
          }),
        }),
      );

      const fileContent = await readFile(
        join(dataRoot, 'wiki', 'linked-doc.md'),
        'utf8',
      );

      expect(fileContent).toContain('outbound:');
      expect(fileContent).toContain('foo');
      expect(fileContent).toContain('missing');
      expect(fileContent).toContain('broken:');
    });

    it('writes empty outbound and broken arrays when no links are present', async () => {
      const repository = new FileSystemDocumentRepository(dataRoot);

      await repository.save(
        WikiDocument.create({
          title: Title.create('No Links Doc'),
          content: 'plain content',
        }),
      );

      const fileContent = await readFile(
        join(dataRoot, 'wiki', 'no-links-doc.md'),
        'utf8',
      );

      expect(fileContent).toMatch(/outbound:\s*(\[\]|$)/m);
      expect(fileContent).toMatch(/broken:\s*(\[\]|$)/m);
    });

    it('round-trips DocumentLinks through save and findByTitle', async () => {
      const repository = new FileSystemDocumentRepository(dataRoot);

      await repository.save(
        WikiDocument.create({
          title: Title.create('Link Round Trip'),
          content: 'body',
          links: DocumentLinks.from({
            outbound: ['alpha', 'beta'],
            broken: ['beta'],
          }),
        }),
      );

      const reloaded = await repository.findByTitle(Title.create('Link Round Trip'));

      expect(reloaded).not.toBeNull();
      expect(reloaded?.links.outbound).toEqual(['alpha', 'beta']);
      expect(reloaded?.links.broken).toEqual(['beta']);
    });

    it('falls back to empty links when legacy frontmatter omits the new fields', async () => {
      const wikiDir = join(dataRoot, 'wiki');
      await mkdir(wikiDir, { recursive: true });
      const legacyContent = `---\ntitle: Legacy Links Doc\ntags: []\nsources: []\nconflict: false\n---\n\nbody`;
      await (await import('node:fs/promises')).writeFile(
        join(wikiDir, 'legacy-links-doc.md'),
        legacyContent,
        'utf8',
      );

      const repository = new FileSystemDocumentRepository(dataRoot);
      const reloaded = await repository.findByTitle(Title.create('Legacy Links Doc'));

      expect(reloaded).not.toBeNull();
      expect(reloaded?.links.outbound).toEqual([]);
      expect(reloaded?.links.broken).toEqual([]);
    });
  });

  describe('parent serialization', () => {
    it('serializes the parent field into the YAML frontmatter', async () => {
      const repository = new FileSystemDocumentRepository(dataRoot);

      await repository.save(
        WikiDocument.create({
          title: Title.create('Child Doc'),
          content: 'body',
          parentSlug: 'parent-doc',
        }),
      );

      const fileContent = await readFile(
        join(dataRoot, 'wiki', 'child-doc.md'),
        'utf8',
      );

      expect(fileContent).toContain('parent: parent-doc');
    });

    it('writes parent: null when no parent is set', async () => {
      const repository = new FileSystemDocumentRepository(dataRoot);

      await repository.save(
        WikiDocument.create({
          title: Title.create('Root Doc'),
          content: 'body',
        }),
      );

      const fileContent = await readFile(
        join(dataRoot, 'wiki', 'root-doc.md'),
        'utf8',
      );

      expect(fileContent).toMatch(/parent:\s*(null|~)/);
    });

    it('round-trips parentSlug through save and findByTitle', async () => {
      const repository = new FileSystemDocumentRepository(dataRoot);

      await repository.save(
        WikiDocument.create({
          title: Title.create('Tree Child'),
          content: 'body',
          parentSlug: 'tree-parent',
        }),
      );

      const reloaded = await repository.findByTitle(Title.create('Tree Child'));

      expect(reloaded).not.toBeNull();
      expect(reloaded?.parentSlug).toBe('tree-parent');
    });

    it('falls back to null parent when legacy frontmatter omits the parent field', async () => {
      const wikiDir = join(dataRoot, 'wiki');
      await mkdir(wikiDir, { recursive: true });
      const legacyContent = `---\ntitle: Legacy Parent Doc\ntags: []\nsources: []\nconflict: false\n---\n\nbody`;
      await (await import('node:fs/promises')).writeFile(
        join(wikiDir, 'legacy-parent-doc.md'),
        legacyContent,
        'utf8',
      );

      const repository = new FileSystemDocumentRepository(dataRoot);
      const reloaded = await repository.findByTitle(Title.create('Legacy Parent Doc'));

      expect(reloaded).not.toBeNull();
      expect(reloaded?.parentSlug).toBeNull();
    });
  });
});
