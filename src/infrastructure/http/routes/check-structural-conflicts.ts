import { Hono } from 'hono';
import type { CheckStructuralConflictsUseCase } from '../../../application/use-cases/check-structural-conflicts.js';

export const createCheckStructuralConflictsRouter = (dependencies: {
  useCase: CheckStructuralConflictsUseCase;
  maxRequestBytes: number;
}): Hono => {
  const router = new Hono();
  router.post('/structural-conflicts/check', async (context) => {
    const raw = await context.req.text();
    if (Buffer.byteLength(raw, 'utf8') > dependencies.maxRequestBytes) {
      return context.json({ message: 'Request body is too large' }, 413);
    }
    let payload: unknown;
    try { payload = JSON.parse(raw); } catch { return context.json({ message: 'Request body must be valid JSON' }, 400); }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return context.json({ message: 'Request body must be a JSON object' }, 400);
    }
    const candidate = payload as Record<string, unknown>;
    if (typeof candidate.title !== 'string' || candidate.title.trim() === '') {
      return context.json({ message: 'title must be a non-empty string' }, 400);
    }
    const tags = Array.isArray(candidate.tags)
      ? candidate.tags.filter((tag): tag is string => typeof tag === 'string')
      : undefined;
    return context.json({ conflicts: await dependencies.useCase.execute({ title: candidate.title, tags }) }, 200);
  });
  return router;
};
