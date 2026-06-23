import { Hono } from 'hono';

import type { GetDocumentUseCase } from '../../../application/use-cases/get-document.js';
import type { WikiDocument } from '../../../domain/wiki/document.js';

type GetDocumentRouteDependencies = {
  getDocumentUseCase: GetDocumentUseCase;
};

type GetDocumentResponse = {
  id: string;
  title: string;
  summary: string;
  status: string;
  domain: string | null;
  tags: readonly string[];
  conflict: boolean;
  conflictWith: readonly string[];
  semanticConflicts: ReadonlyArray<{
    conflictingDocumentSlug: string;
    conflictingDocumentTitle: string;
    explanation: string;
    confidence: 'high' | 'medium' | 'low';
  }>;
  parentSlug: string | null;
  content: string;
  sources: ReadonlyArray<{
    pageId: string;
    title: string;
    url: string;
    lastSynced: string;
  }>;
  links: {
    outbound: readonly string[];
    broken: readonly string[];
  };
  createdAt: string | null;
  updatedAt: string | null;
};

export const createGetDocumentRouter = ({ getDocumentUseCase }: GetDocumentRouteDependencies): Hono => {
  const router = new Hono();

  router.get('/:id', async (context) => {
    const id = context.req.param('id')?.trim();

    if (!id) {
      return context.json({ error: 'Document not found', id: '' }, 404);
    }

    const document = await getDocumentUseCase.execute({ id });

    if (document === null) {
      return context.json({ error: 'Document not found', id }, 404);
    }

    return context.json(serializeDocument(id, document), 200);
  });

  return router;
};

const serializeDocument = (id: string, document: WikiDocument): GetDocumentResponse => {
  return {
    id,
    title: document.title.value,
    summary: '',
    status: document.metadata.status.value,
    domain: document.metadata.domain ? document.metadata.domain.value : null,
    tags: [...document.metadata.tags],
    conflict: document.metadata.conflict,
    conflictWith: [...document.metadata.conflictWith],
    semanticConflicts: document.metadata.semanticConflicts.map((conflict) => ({ ...conflict })),
    parentSlug: document.parentSlug,
    content: document.content,
    sources: document.frontmatter.sources.map((source) => ({ ...source })),
    links: {
      outbound: [...document.links.outbound],
      broken: [...document.links.broken],
    },
    createdAt: null,
    updatedAt: null,
  };
};
