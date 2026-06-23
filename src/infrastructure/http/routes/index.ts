import { Hono } from 'hono';

import type { ListIndexUseCase } from '../../../application/use-cases/list-index.js';

type IndexRouteDependencies = {
  listIndexUseCase: ListIndexUseCase;
};

const MAX_INDEX_PAGE_SIZE = 100;

export const createIndexRouter = ({ listIndexUseCase }: IndexRouteDependencies): Hono => {
  const router = new Hono();

  router.get('/', async (context) => {
    const entries = await listIndexUseCase.execute();
    const requestedLimit = Number(context.req.query('limit') ?? MAX_INDEX_PAGE_SIZE);
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(MAX_INDEX_PAGE_SIZE, Math.trunc(requestedLimit)))
      : MAX_INDEX_PAGE_SIZE;

    return context.json(
      entries.slice(0, limit).map((entry) => ({
        title: entry.title,
        summary: entry.summary,
        sourceCount: entry.sourceCount,
        status: entry.status.value,
        domain: entry.domain?.value ?? null,
      })),
    );
  });

  return router;
};
