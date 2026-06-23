import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { IndexCatalog } from '../../../application/ports/index-catalog.js';
import { Domain } from '../../../domain/wiki/domain.js';
import { IndexEntry } from '../../../domain/wiki/index-entry.js';
import { Status } from '../../../domain/wiki/status.js';

const titleToSlug = (title: string): string => title.toLowerCase().replace(/\s+/g, '-');

type SerializedIndexEntry = {
  title: string;
  summary: string;
  sourceCount: number;
  status: string;
  domain: string | null;
};

type RawIndexEntry = {
  title: string;
  summary: string;
  sourceCount: number;
  status?: string;
  domain?: string | null;
};

export class FileSystemIndexCatalog implements IndexCatalog {
  private readonly wikiDir: string;
  private readonly indexPath: string;

  constructor(dataRoot: string) {
    this.wikiDir = join(dataRoot, 'wiki');
    this.indexPath = join(this.wikiDir, 'index.json');
  }

  async upsert(entry: IndexEntry): Promise<void> {
    const existing = await this.loadEntries();
    const next = mergeEntry(existing, entry);
    await mkdir(this.wikiDir, { recursive: true });
    await writeFile(this.indexPath, JSON.stringify(next, null, 2), 'utf8');
  }

  async list(): Promise<IndexEntry[]> {
    const entries = await this.loadEntries();
    return entries
      .map((entry) =>
        IndexEntry.create({
          title: entry.title,
          summary: entry.summary,
          sourceCount: entry.sourceCount,
          status: resolveStatus(entry.status),
          domain: resolveDomain(entry.domain),
        }),
      )
      .sort(IndexEntry.compareByTitle);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.loadEntries();
    const next = existing.filter((entry) => titleToSlug(entry.title) !== id);
    if (next.length === existing.length) {
      return;
    }
    await mkdir(this.wikiDir, { recursive: true });
    await writeFile(this.indexPath, JSON.stringify(next, null, 2), 'utf8');
  }

  private async loadEntries(): Promise<RawIndexEntry[]> {
    const raw = await readFileOrNull(this.indexPath);
    if (raw === null) {
      return [];
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isRawIndexEntry);
  }
}

const mergeEntry = (
  existing: RawIndexEntry[],
  entry: IndexEntry,
): SerializedIndexEntry[] => {
  const incoming: SerializedIndexEntry = {
    title: entry.title,
    summary: entry.summary,
    sourceCount: entry.sourceCount,
    status: entry.status.value,
    domain: entry.domain?.value ?? null,
  };

  const normalized = existing.map(toSerializedEntry);
  const index = normalized.findIndex((item) => item.title === incoming.title);
  if (index === -1) {
    return [...normalized, incoming];
  }

  const next = [...normalized];
  next[index] = incoming;
  return next;
};

const toSerializedEntry = (entry: RawIndexEntry): SerializedIndexEntry => ({
  title: entry.title,
  summary: entry.summary,
  sourceCount: entry.sourceCount,
  status: resolveStatus(entry.status).value,
  domain: resolveDomain(entry.domain)?.value ?? null,
});

const resolveStatus = (value: string | undefined): Status => {
  if (value === undefined || value === null) {
    return Status.from('draft');
  }
  try {
    return Status.from(value);
  } catch {
    return Status.from('draft');
  }
};

const resolveDomain = (value: string | null | undefined): Domain | null => {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }
  try {
    return Domain.from(value);
  } catch {
    return null;
  }
};

const isRawIndexEntry = (value: unknown): value is RawIndexEntry => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.title !== 'string' ||
    typeof candidate.summary !== 'string' ||
    typeof candidate.sourceCount !== 'number'
  ) {
    return false;
  }
  if (candidate.status !== undefined && typeof candidate.status !== 'string') {
    return false;
  }
  if (
    candidate.domain !== undefined &&
    candidate.domain !== null &&
    typeof candidate.domain !== 'string'
  ) {
    return false;
  }
  return true;
};

const readFileOrNull = async (path: string): Promise<string | null> => {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
};
