import { Hono } from 'hono';

import type { PreviewDocumentUseCase } from '../../../application/use-cases/preview-document.js';

type PreviewDocumentRouteDependencies = {
  previewDocumentUseCase: PreviewDocumentUseCase;
  maxRequestBytes: number;
};

export const createPreviewDocumentRouter = ({
  previewDocumentUseCase,
  maxRequestBytes,
}: PreviewDocumentRouteDependencies): Hono => {
  const router = new Hono();

  router.post('/preview', async (context) => {
    try {
      const rawBody = await context.req.text();

      if (Buffer.byteLength(rawBody, 'utf8') > maxRequestBytes) {
        return context.json({ message: `Request body exceeds the ${maxRequestBytes} byte limit` }, 413);
      }

      let payload: unknown;
      try {
        payload = JSON.parse(rawBody);
      } catch {
        return context.json({ message: 'Request body must be valid JSON' }, 400);
      }

      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return context.json({ message: 'Request body must be a JSON object' }, 400);
      }

      const candidate = payload as Record<string, unknown>;

      if (typeof candidate.title !== 'string' || !candidate.title.trim()) {
        return context.json({ message: 'title must be a non-empty string' }, 400);
      }

      if (typeof candidate.content !== 'string' || !candidate.content.trim()) {
        return context.json({ message: 'content must be a non-empty string' }, 400);
      }

      const result = await previewDocumentUseCase.execute({
        title: candidate.title.trim(),
        content: candidate.content,
        tags: Array.isArray(candidate.tags)
          ? (candidate.tags as string[]).filter((t) => typeof t === 'string')
          : undefined,
      });

      return context.json(result, 200);
    } catch {
      return context.json({ message: 'internal_error' }, 500);
    }
  });

  return router;
};
