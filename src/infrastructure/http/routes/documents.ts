import { Hono } from 'hono';

import { ContentRequiredForSummaryGenerationError } from '../../../application/errors/content-required-for-summary-generation-error.js';
import { SummaryGeneratorNotConfiguredError } from '../../../application/errors/summary-generator-not-configured-error.js';
import { InvalidIndexEntryError } from '../../../domain/wiki/index-entry.js';
import { InvalidTitleError } from '../../../domain/wiki/title.js';
import type { SaveDocumentUseCase } from '../../../application/use-cases/save-document.js';
import { InMemoryDocumentStorageLimitExceededError } from '../../persistence/in-memory/in-memory-document-repository.js';

type DocumentRouteDependencies = {
  saveDocumentUseCase: SaveDocumentUseCase;
  maxRequestBytes: number;
};

type CreateDocumentPayload = {
  title: string;
  summary?: string;
  content?: string;
  tags?: string[];
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

class InvalidDocumentPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidDocumentPayloadError';
  }
}

export const createDocumentsRouter = ({ saveDocumentUseCase, maxRequestBytes }: DocumentRouteDependencies): Hono => {
  const router = new Hono();

  router.post('/', async (context) => {
    try {
      const payload = validateCreateDocumentPayload(await parseRequestBody(context.req.raw, maxRequestBytes));
      const result = await saveDocumentUseCase.execute(payload);

      return context.json(
        {
          title: result.document.title.value,
          summary: result.summary,
          status: result.status,
        },
        201,
      );
    } catch (error) {
      if (
        error instanceof InvalidJsonError ||
        error instanceof InvalidDocumentPayloadError ||
        error instanceof ContentRequiredForSummaryGenerationError ||
        error instanceof SummaryGeneratorNotConfiguredError ||
        error instanceof InvalidTitleError ||
        error instanceof InvalidIndexEntryError
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

  try {
    return JSON.parse(rawBody);
  } catch {
    throw new InvalidJsonError();
  }
};

const validateCreateDocumentPayload = (payload: unknown): CreateDocumentPayload => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new InvalidDocumentPayloadError('Request body must be a JSON object');
  }

  const candidate = payload as Record<string, unknown>;

  if (typeof candidate.title !== 'string') {
    throw new InvalidDocumentPayloadError('title must be a string');
  }

  if (candidate.summary !== undefined && typeof candidate.summary !== 'string') {
    throw new InvalidDocumentPayloadError('summary must be a string');
  }

  if (candidate.content !== undefined && typeof candidate.content !== 'string') {
    throw new InvalidDocumentPayloadError('content must be a string when provided');
  }

  if (candidate.tags !== undefined) {
    if (!Array.isArray(candidate.tags) || candidate.tags.some((tag) => typeof tag !== 'string')) {
      throw new InvalidDocumentPayloadError('tags must be an array of strings when provided');
    }

    if (candidate.tags.length > 32) {
      throw new InvalidDocumentPayloadError('tags must contain at most 32 items');
    }
  }

  const title = candidate.title.trim();
  const summary = typeof candidate.summary === 'string' ? candidate.summary.trim() : undefined;
  const content = candidate.content ?? '';

  if (title.length > 200) {
    throw new InvalidDocumentPayloadError('title must be 200 characters or fewer');
  }

  if (summary !== undefined && summary.length > 2_000) {
    throw new InvalidDocumentPayloadError('summary must be 2000 characters or fewer');
  }

  if (content.length > 100_000) {
    throw new InvalidDocumentPayloadError('content must be 100000 characters or fewer');
  }

  if (candidate.tags?.some((tag) => tag.length > 64)) {
    throw new InvalidDocumentPayloadError('each tag must be 64 characters or fewer');
  }

  return {
    title: candidate.title,
    summary: candidate.summary as string | undefined,
    content: candidate.content as string | undefined,
    tags: candidate.tags as string[] | undefined,
  };
};
