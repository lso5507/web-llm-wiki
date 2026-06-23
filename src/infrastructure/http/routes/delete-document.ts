import { Hono } from 'hono';

import type { DeleteDocumentUseCase } from '../../../application/use-cases/delete-document.js';

type DeleteDocumentRouteDependencies = {
  deleteDocumentUseCase: DeleteDocumentUseCase;
};

export const createDeleteDocumentRouter = ({
  deleteDocumentUseCase,
}: DeleteDocumentRouteDependencies): Hono => {
  const router = new Hono();

  router.delete('/:id', async (context) => {
    const id = context.req.param('id')?.trim();
    if (!id) {
      return context.body(null, 204);
    }

    await deleteDocumentUseCase.execute({ id });
    return context.body(null, 204);
  });

  return router;
};
