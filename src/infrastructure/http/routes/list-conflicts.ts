import { Hono } from 'hono';
import type { ListConflictsUseCase } from '../../../application/use-cases/list-conflicts.js';

type ListConflictsRouteDependencies = {
  listConflictsUseCase: ListConflictsUseCase;
};

export const createListConflictsRouter = (dependencies: ListConflictsRouteDependencies): Hono => {
  const { listConflictsUseCase } = dependencies;
  const app = new Hono();

  app.get('/', async (c) => {
    try {
      const conflicts = await listConflictsUseCase.execute();
      return c.json(conflicts);
    } catch (error) {
      console.error('Error listing conflicts:', error);
      return c.json({ message: 'internal_error' }, 500);
    }
  });

  return app;
};
