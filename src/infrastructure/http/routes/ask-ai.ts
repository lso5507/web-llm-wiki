import { Hono } from 'hono';

import {
  AskAIUseCase,
  EmptyQuestionError,
} from '../../../application/use-cases/ask-ai.js';

type AskAIRouteDependencies = {
  askAIUseCase: AskAIUseCase | null;
  maxRequestBytes?: number;
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

class InvalidAskPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAskPayloadError';
  }
}

const DEFAULT_MAX_REQUEST_BYTES = 16 * 1024;

export const createAskAIRouter = ({
  askAIUseCase,
  maxRequestBytes = DEFAULT_MAX_REQUEST_BYTES,
}: AskAIRouteDependencies): Hono => {
  const router = new Hono();

  router.post('/', async (context) => {
    if (askAIUseCase === null) {
      return context.json(
        { message: 'Ask AI is not configured. Set OPENROUTER_API_KEY to enable.' },
        503,
      );
    }

    let question: string;
    try {
      const payload = await parseRequestBody(context.req.raw, maxRequestBytes);
      question = validateAskPayload(payload);
    } catch (error) {
      if (error instanceof InvalidJsonError || error instanceof InvalidAskPayloadError) {
        return context.json({ message: error.message }, 400);
      }
      if (error instanceof RequestBodyTooLargeError) {
        return context.json({ message: error.message }, 413);
      }
      throw error;
    }

    try {
      const result = await askAIUseCase.execute({ question });
      return context.json({ answer: result.answer, sources: result.sources }, 200);
    } catch (error) {
      if (error instanceof EmptyQuestionError) {
        return context.json({ message: error.message }, 400);
      }
      return context.json({ message: 'Failed to generate answer' }, 500);
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

const validateAskPayload = (payload: unknown): string => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new InvalidAskPayloadError('Request body must be a JSON object');
  }

  const candidate = payload as Record<string, unknown>;
  if (typeof candidate.question !== 'string') {
    throw new InvalidAskPayloadError('question must be a non-empty string');
  }

  if (candidate.question.trim() === '') {
    throw new InvalidAskPayloadError('question must be a non-empty string');
  }

  if (candidate.question.length > 4_000) {
    throw new InvalidAskPayloadError('question must be 4000 characters or fewer');
  }

  return candidate.question;
};
