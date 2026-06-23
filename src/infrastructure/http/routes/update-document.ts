import { Hono } from 'hono';

import { DocumentNotFoundError } from '../../../application/errors/document-not-found-error.js';
import type { UpdateDocumentUseCase } from '../../../application/use-cases/update-document.js';
import { InvalidDocumentMetadataError } from '../../../domain/wiki/document-metadata.js';
import { InvalidDomainError } from '../../../domain/wiki/domain.js';
import { CircularHierarchyError } from '../../../domain/wiki/hierarchy-validator.js';
import { InvalidIndexEntryError } from '../../../domain/wiki/index-entry.js';
import { InvalidStatusError } from '../../../domain/wiki/status.js';
import { InvalidTitleError } from '../../../domain/wiki/title.js';
import type { WikiDocument } from '../../../domain/wiki/document.js';
import { InMemoryDocumentStorageLimitExceededError } from '../../persistence/in-memory/in-memory-document-repository.js';

type UpdateDocumentRouteDependencies = {
  updateDocumentUseCase: UpdateDocumentUseCase;
  maxRequestBytes: number;
};

type UpdateDocumentPayload = {
  title?: string;
  content?: string;
  tags?: string[];
  status?: string;
  domain?: string | null;
  domainProvided: boolean;
  parentSlug?: string | null;
  parentSlugProvided: boolean;
};

type UpdateDocumentResponse = {
  id: string;
  title: string;
  content: string;
  tags: readonly string[];
  status: string;
  domain: string | null;
  conflict: boolean;
  conflictWith: readonly string[];
  parentSlug: string | null;
  sources: ReadonlyArray<{
    pageId: string;
    title: string;
    url: string;
    lastSynced: string;
  }>;
};

class InvalidJsonError extends Error {
  constructor() {
    super('Request body must be valid JSON');
    this.name = 'InvalidJsonError';
  }
}

class RequestBodyTooLargeError extends Error {
  constructor(maxRequestBytes: number) {
    super(`Request body exceeds the ${maxRequestBytes} byte limit`);
    this.name = 'RequestBodyTooLargeError';
  }
}

class InvalidUpdateDocumentPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidUpdateDocumentPayloadError';
  }
}

export const createUpdateDocumentRouter = ({
  updateDocumentUseCase,
  maxRequestBytes,
}: UpdateDocumentRouteDependencies): Hono => {
  const router = new Hono();

  router.put('/:id', async (context) => {
    const id = context.req.param('id')?.trim();
    if (!id) {
      return context.json({ error: 'Document not found', id: '' }, 404);
    }

    try {
      const payload = validateUpdateDocumentPayload(await parseRequestBody(context.req.raw, maxRequestBytes));
      const useCaseInput: Parameters<UpdateDocumentUseCase['execute']>[0] = { id };
      if (payload.title !== undefined) useCaseInput.title = payload.title;
      if (payload.content !== undefined) useCaseInput.content = payload.content;
      if (payload.tags !== undefined) useCaseInput.tags = payload.tags;
      if (payload.status !== undefined) useCaseInput.status = payload.status;
      if (payload.domainProvided) useCaseInput.domain = payload.domain ?? null;
      if (payload.parentSlugProvided) useCaseInput.parentSlug = payload.parentSlug ?? null;

      const document = await updateDocumentUseCase.execute(useCaseInput);
      return context.json(serializeDocument(document), 200);
    } catch (error) {
      if (error instanceof DocumentNotFoundError) {
        return context.json({ error: 'Document not found', id }, 404);
      }

      if (
        error instanceof InvalidJsonError ||
        error instanceof InvalidUpdateDocumentPayloadError ||
        error instanceof InvalidTitleError ||
        error instanceof InvalidIndexEntryError ||
        error instanceof InvalidStatusError ||
        error instanceof InvalidDomainError ||
        error instanceof InvalidDocumentMetadataError ||
        error instanceof CircularHierarchyError
      ) {
        return context.json({ message: error.message }, 400);
      }

      if (error instanceof RequestBodyTooLargeError) {
        return context.json({ message: error.message }, 413);
      }

      if (error instanceof InMemoryDocumentStorageLimitExceededError) {
        return context.json({ message: error.message }, 503);
      }

      throw error;
    }
  });

  return router;
};

const parseRequestBody = async (request: Request, maxRequestBytes: number): Promise<unknown> => {
  const rawBody = await request.text();

  if (Buffer.byteLength(rawBody, 'utf8') > maxRequestBytes) {
    throw new RequestBodyTooLargeError(maxRequestBytes);
  }

  if (rawBody.length === 0) {
    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    throw new InvalidJsonError();
  }
};

const validateUpdateDocumentPayload = (payload: unknown): UpdateDocumentPayload => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new InvalidUpdateDocumentPayloadError('Request body must be a JSON object');
  }

  const candidate = payload as Record<string, unknown>;

  if (candidate.title !== undefined && typeof candidate.title !== 'string') {
    throw new InvalidUpdateDocumentPayloadError('title must be a string when provided');
  }

  if (candidate.content !== undefined && typeof candidate.content !== 'string') {
    throw new InvalidUpdateDocumentPayloadError('content must be a string when provided');
  }

  if (candidate.tags !== undefined) {
    if (!Array.isArray(candidate.tags) || candidate.tags.some((tag) => typeof tag !== 'string')) {
      throw new InvalidUpdateDocumentPayloadError('tags must be an array of strings when provided');
    }

    if (candidate.tags.length > 32) {
      throw new InvalidUpdateDocumentPayloadError('tags must contain at most 32 items');
    }

    if ((candidate.tags as string[]).some((tag) => tag.length > 64)) {
      throw new InvalidUpdateDocumentPayloadError('each tag must be 64 characters or fewer');
    }
  }

  if (candidate.status !== undefined && typeof candidate.status !== 'string') {
    throw new InvalidUpdateDocumentPayloadError('status must be a string when provided');
  }

  const domainProvided = Object.prototype.hasOwnProperty.call(candidate, 'domain');
  if (
    domainProvided &&
    candidate.domain !== null &&
    typeof candidate.domain !== 'string'
  ) {
    throw new InvalidUpdateDocumentPayloadError('domain must be a string or null when provided');
  }

  const parentSlugProvided = Object.prototype.hasOwnProperty.call(candidate, 'parentSlug');
  if (
    parentSlugProvided &&
    candidate.parentSlug !== null &&
    typeof candidate.parentSlug !== 'string'
  ) {
    throw new InvalidUpdateDocumentPayloadError(
      'parentSlug must be a string or null when provided',
    );
  }

  if (
    parentSlugProvided &&
    typeof candidate.parentSlug === 'string' &&
    candidate.parentSlug.length > 200
  ) {
    throw new InvalidUpdateDocumentPayloadError('parentSlug must be 200 characters or fewer');
  }

  if (typeof candidate.title === 'string' && candidate.title.length > 200) {
    throw new InvalidUpdateDocumentPayloadError('title must be 200 characters or fewer');
  }

  if (typeof candidate.content === 'string' && candidate.content.length > 100_000) {
    throw new InvalidUpdateDocumentPayloadError('content must be 100000 characters or fewer');
  }

  return {
    title: candidate.title as string | undefined,
    content: candidate.content as string | undefined,
    tags: candidate.tags as string[] | undefined,
    status: candidate.status as string | undefined,
    domain: domainProvided ? (candidate.domain as string | null) : undefined,
    domainProvided,
    parentSlug: parentSlugProvided ? (candidate.parentSlug as string | null) : undefined,
    parentSlugProvided,
  };
};

const serializeDocument = (document: WikiDocument): UpdateDocumentResponse => {
  return {
    id: document.title.toSlug(),
    title: document.title.value,
    content: document.content,
    tags: [...document.metadata.tags],
    status: document.metadata.status.value,
    domain: document.metadata.domain ? document.metadata.domain.value : null,
    conflict: document.metadata.conflict,
    conflictWith: [...document.metadata.conflictWith],
    parentSlug: document.parentSlug,
    sources: document.frontmatter.sources.map((source) => ({ ...source })),
  };
};
