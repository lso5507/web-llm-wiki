import { mkdtempSync, rmSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Domain } from '../../../../src/domain/wiki/domain.js';
import { FileSystemIndexCatalog } from '../../../../src/infrastructure/persistence/filesystem/file-system-index-catalog.js';
import { IndexEntry } from '../../../../src/domain/wiki/index-entry.js';
import { Status } from '../../../../src/domain/wiki/status.js';

const createTempDir = (): string =>
  mkdtempSync(join(tmpdir(), 'web-llm-wiki-index-cat-'));

describe('FileSystemIndexCatalog', () => {
  let dataRoot: string;
  let indexPath: string;

  beforeEach(() => {
    dataRoot = createTempDir();
    indexPath = join(dataRoot, 'wiki', 'index.json');
  });

  afterEach(() => {
    rmSync(dataRoot, { recursive: true, force: true });
  });

  it('creates index.json under {DATA_ROOT}/wiki on first upsert', async () => {
    const catalog = new FileSystemIndexCatalog(dataRoot);

    await catalog.upsert(
      IndexEntry.create({ title: 'Foo', summary: 'foo summary' }),
    );

    const raw = await readFile(indexPath, 'utf8');
    const parsed = JSON.parse(raw) as Array<Record<string, unknown>>;
    expect(parsed).toEqual([
      {
        title: 'Foo',
        summary: 'foo summary',
        sourceCount: 0,
        status: 'draft',
        domain: null,
      },
    ]);
  });

  it('returns an empty list when no index.json exists yet', async () => {
    const catalog = new FileSystemIndexCatalog(dataRoot);

    expect(await catalog.list()).toEqual([]);
  });

  it('upserts multiple entries and returns them sorted by title', async () => {
    const catalog = new FileSystemIndexCatalog(dataRoot);

    await catalog.upsert(IndexEntry.create({ title: 'Foo', summary: 'old' }));
    await catalog.upsert(IndexEntry.create({ title: 'Bar', summary: 'bar' }));
    await catalog.upsert(IndexEntry.create({ title: 'Foo', summary: 'new' }));

    const list = await catalog.list();
    expect(list).toEqual([
      IndexEntry.create({ title: 'Bar', summary: 'bar' }),
      IndexEntry.create({ title: 'Foo', summary: 'new' }),
    ]);
  });

  it('persists upserts across catalog instances pointing at the same root', async () => {
    const first = new FileSystemIndexCatalog(dataRoot);
    await first.upsert(
      IndexEntry.create({ title: 'Foo', summary: 'foo summary', sourceCount: 3 }),
    );

    const second = new FileSystemIndexCatalog(dataRoot);
    const entries = await second.list();
    expect(entries).toEqual([
      IndexEntry.create({ title: 'Foo', summary: 'foo summary', sourceCount: 3 }),
    ]);
  });

  it('returns an empty list when index.json contains malformed JSON', async () => {
    const wikiDir = join(dataRoot, 'wiki');
    await mkdir(wikiDir, { recursive: true });
    await writeFile(indexPath, 'not json', 'utf8');

    const catalog = new FileSystemIndexCatalog(dataRoot);

    expect(await catalog.list()).toEqual([]);
  });

  it('overwrites a malformed index.json on the next upsert', async () => {
    const wikiDir = join(dataRoot, 'wiki');
    await mkdir(wikiDir, { recursive: true });
    await writeFile(indexPath, 'not json', 'utf8');

    const catalog = new FileSystemIndexCatalog(dataRoot);
    await catalog.upsert(
      IndexEntry.create({ title: 'Foo', summary: 'foo summary' }),
    );

    expect(await catalog.list()).toEqual([
      IndexEntry.create({ title: 'Foo', summary: 'foo summary' }),
    ]);
  });

  it('serializes status and domain when upserting', async () => {
    const catalog = new FileSystemIndexCatalog(dataRoot);

    await catalog.upsert(
      IndexEntry.create({
        title: 'Foo',
        summary: 'foo summary',
        status: Status.from('review'),
        domain: Domain.from('tech-stack'),
      }),
    );

    const raw = await readFile(indexPath, 'utf8');
    const parsed = JSON.parse(raw) as Array<Record<string, unknown>>;
    expect(parsed).toEqual([
      {
        title: 'Foo',
        summary: 'foo summary',
        sourceCount: 0,
        status: 'review',
        domain: 'tech-stack',
      },
    ]);
  });

  it('deserializes status and domain on list', async () => {
    const catalog = new FileSystemIndexCatalog(dataRoot);

    await catalog.upsert(
      IndexEntry.create({
        title: 'Foo',
        summary: 'foo summary',
        status: Status.from('published'),
        domain: Domain.from('product-design'),
      }),
    );

    const entries = await catalog.list();
    expect(entries).toHaveLength(1);
    expect(entries[0].status.value).toBe('published');
    expect(entries[0].domain?.value).toBe('product-design');
  });

  it('reads legacy index.json without status/domain and applies defaults', async () => {
    const wikiDir = join(dataRoot, 'wiki');
    await mkdir(wikiDir, { recursive: true });
    await writeFile(
      indexPath,
      JSON.stringify([
        { title: 'Legacy Foo', summary: 'legacy summary', sourceCount: 1 },
      ]),
      'utf8',
    );

    const catalog = new FileSystemIndexCatalog(dataRoot);
    const entries = await catalog.list();

    expect(entries).toHaveLength(1);
    expect(entries[0].title).toBe('Legacy Foo');
    expect(entries[0].summary).toBe('legacy summary');
    expect(entries[0].sourceCount).toBe(1);
    expect(entries[0].status.value).toBe('draft');
    expect(entries[0].domain).toBeNull();
  });

  it('reads legacy index.json with null domain encoded as missing field', async () => {
    const wikiDir = join(dataRoot, 'wiki');
    await mkdir(wikiDir, { recursive: true });
    await writeFile(
      indexPath,
      JSON.stringify([
        {
          title: 'Partial',
          summary: 'partial summary',
          sourceCount: 0,
          status: 'review',
        },
      ]),
      'utf8',
    );

    const catalog = new FileSystemIndexCatalog(dataRoot);
    const entries = await catalog.list();

    expect(entries[0].status.value).toBe('review');
    expect(entries[0].domain).toBeNull();
  });
});
