import { mkdir, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { dump, load } from 'js-yaml';

import type { DocumentRepository } from '../../../application/ports/document-repository.js';
import { DocumentLinks } from '../../../domain/wiki/document-links.js';
import { DocumentMetadata } from '../../../domain/wiki/document-metadata.js';
import { WikiDocument } from '../../../domain/wiki/document.js';
import { type SourceReference } from '../../../domain/wiki/frontmatter.js';
import { Title } from '../../../domain/wiki/title.js';

const FRONTMATTER_DELIMITER = '---';
const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

type SerializedFrontmatter = {
  title: string;
  status: string;
  domain: string | null;
  tags: string[];
  sources: SourceReference[];
  conflict: boolean;
  conflictWith: string[];
  semanticConflicts: Array<{
    conflictingDocumentSlug: string;
    conflictingDocumentTitle: string;
    explanation: string;
    confidence: 'high' | 'medium' | 'low';
  }>;
  outbound: string[];
  broken: string[];
  parent: string | null;
};

type ParsedFrontmatterShape = {
  title: string;
  status?: string;
  domain?: string | null;
  tags: string[];
  sources: SourceReference[];
  conflict: boolean;
  conflictWith?: string[];
  semanticConflicts?: Array<{
    conflictingDocumentSlug: string;
    conflictingDocumentTitle: string;
    explanation: string;
    confidence: 'high' | 'medium' | 'low';
  }>;
  outbound?: string[];
  broken?: string[];
  parent?: string | null;
};

export class FileSystemDocumentRepository implements DocumentRepository {
  private readonly wikiDir: string;

  constructor(dataRoot: string) {
    this.wikiDir = join(dataRoot, 'wiki');
  }

  async save(document: WikiDocument): Promise<void> {
    await mkdir(this.wikiDir, { recursive: true });
    const filePath = this.resolveFilePath(document.title);
    const fileContent = serializeDocument(document);
    await writeFile(filePath, fileContent, 'utf8');
  }

  async findByTitle(title: Title): Promise<WikiDocument | null> {
    const filePath = this.resolveFilePath(title);
    const raw = await readFileOrNull(filePath);
    if (raw === null) {
      return null;
    }

    return parseDocument(raw);
  }

  async findById(id: string): Promise<WikiDocument | null> {
    const filePath = this.resolveFilePathFromId(id);
    const raw = await readFileOrNull(filePath);
    if (raw === null) {
      return null;
    }

    return parseDocument(raw);
  }

  async findAll(): Promise<WikiDocument[]> {
    const fileNames = await readDirOrEmpty(this.wikiDir);
    const documents: WikiDocument[] = [];

    for (const fileName of fileNames) {
      if (!fileName.endsWith('.md')) {
        continue;
      }

      const raw = await readFileOrNull(join(this.wikiDir, fileName));
      if (raw === null) {
        continue;
      }

      const document = parseDocument(raw);
      if (document !== null) {
        documents.push(document);
      }
    }

    return documents;
  }

  async delete(id: string): Promise<void> {
    const filePath = this.resolveFilePathFromId(id);
    try {
      await unlink(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return;
      }
      throw error;
    }
  }

  async exists(slug: string): Promise<boolean> {
    const filePath = this.resolveFilePathFromId(slug);
    try {
      await stat(filePath);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }

  private resolveFilePath(title: Title): string {
    return join(this.wikiDir, `${title.toSlug()}.md`);
  }

  private resolveFilePathFromId(id: string): string {
    return join(this.wikiDir, `${id}.md`);
  }
}

const serializeDocument = (document: WikiDocument): string => {
  const frontmatter: SerializedFrontmatter = {
    title: document.title.value,
    status: document.metadata.status.value,
    domain: document.metadata.domain?.value ?? null,
    tags: [...document.metadata.tags],
    sources: document.frontmatter.sources.map((source) => ({ ...source })),
    conflict: document.metadata.conflict,
    conflictWith: [...document.metadata.conflictWith],
    semanticConflicts: document.metadata.semanticConflicts.map((conflict) => ({ ...conflict })),
    outbound: [...document.links.outbound],
    broken: [...document.links.broken],
    parent: document.parentSlug ?? null,
  };

  const yamlBlock = dump(frontmatter, { lineWidth: -1, noRefs: true });
  return `${FRONTMATTER_DELIMITER}\n${yamlBlock}${FRONTMATTER_DELIMITER}\n\n${document.content}`;
};

const parseDocument = (raw: string): WikiDocument | null => {
  const match = FRONTMATTER_PATTERN.exec(raw);
  if (!match) {
    return null;
  }

  const [, yamlBlock, body] = match;

  let parsed: unknown;
  try {
    parsed = load(yamlBlock);
  } catch {
    return null;
  }

  if (!isFrontmatterShape(parsed)) {
    return null;
  }

  try {
    const metadata = DocumentMetadata.from({
      status: parsed.status,
      domain: resolveStoredDomainValue(parsed.domain),
      tags: parsed.tags,
      conflict: parsed.conflict,
      conflictWith: parsed.conflictWith ?? [],
      semanticConflicts: parsed.semanticConflicts ?? [],
    });

    const links = DocumentLinks.from({
      outbound: parsed.outbound ?? [],
      broken: parsed.broken ?? [],
    });

    return WikiDocument.create({
      title: Title.create(parsed.title),
      content: stripLeadingNewline(body),
      sources: parsed.sources.map((source) => ({ ...source })),
      metadata,
      links,
      parentSlug: resolveStoredParentValue(parsed.parent),
    });
  } catch {
    return null;
  }
};

const stripLeadingNewline = (body: string): string => {
  if (body.startsWith('\r\n')) {
    return body.slice(2);
  }
  if (body.startsWith('\n')) {
    return body.slice(1);
  }
  return body;
};

const resolveStoredDomainValue = (value: unknown): string | null => {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }
  return value;
};

const resolveStoredParentValue = (value: unknown): string | null => {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

const isFrontmatterShape = (value: unknown): value is ParsedFrontmatterShape => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.title !== 'string') {
    return false;
  }
  if (!Array.isArray(candidate.tags) || !candidate.tags.every((tag) => typeof tag === 'string')) {
    return false;
  }
  if (!Array.isArray(candidate.sources) || !candidate.sources.every(isSourceReferenceShape)) {
    return false;
  }
  if (typeof candidate.conflict !== 'boolean') {
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
  if (
    candidate.conflictWith !== undefined &&
    (!Array.isArray(candidate.conflictWith) ||
      !candidate.conflictWith.every((id) => typeof id === 'string'))
  ) {
    return false;
  }
  if (
    candidate.semanticConflicts !== undefined &&
    (!Array.isArray(candidate.semanticConflicts) ||
      !candidate.semanticConflicts.every(isSemanticConflictShape))
  ) {
    return false;
  }
  if (
    candidate.outbound !== undefined &&
    (!Array.isArray(candidate.outbound) ||
      !candidate.outbound.every((slug) => typeof slug === 'string'))
  ) {
    return false;
  }
  if (
    candidate.broken !== undefined &&
    (!Array.isArray(candidate.broken) ||
      !candidate.broken.every((slug) => typeof slug === 'string'))
  ) {
    return false;
  }
  if (
    candidate.parent !== undefined &&
    candidate.parent !== null &&
    typeof candidate.parent !== 'string'
  ) {
    return false;
  }
  return true;
};

const isSemanticConflictShape = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.conflictingDocumentSlug === 'string' &&
    typeof candidate.conflictingDocumentTitle === 'string' &&
    typeof candidate.explanation === 'string' &&
    (candidate.confidence === 'high' ||
      candidate.confidence === 'medium' ||
      candidate.confidence === 'low')
  );
};

const isSourceReferenceShape = (value: unknown): value is SourceReference => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.pageId === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.url === 'string' &&
    typeof candidate.lastSynced === 'string'
  );
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

const readDirOrEmpty = async (path: string): Promise<string[]> => {
  try {
    return await readdir(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
};
