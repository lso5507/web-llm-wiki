import { Hono } from 'hono';

import type { SearchDocumentsUseCase } from '../../../application/use-cases/search-documents.js';
import type { WikiDocument } from '../../../domain/wiki/document.js';

type SearchDocumentsRouteDependencies = {
  searchDocumentsUseCase: SearchDocumentsUseCase;
};

type SearchDocumentResponseEntry = {
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
  createdAt: string | null;
  updatedAt: string | null;
};

export const createSearchDocumentsRouter = ({
  searchDocumentsUseCase,
}: SearchDocumentsRouteDependencies): Hono => {
  const router = new Hono();

  router.get('/search', async (context) => {
    const query = context.req.query('query');
    const domain = context.req.query('domain');
    const status = context.req.query('status');
    const rawTags = context.req.query('tags');
    const tags = parseTags(rawTags);

    const useCaseInput: Parameters<SearchDocumentsUseCase['execute']>[0] = {};
    if (query !== undefined) useCaseInput.query = query;
    if (domain !== undefined) useCaseInput.domain = domain;
    if (status !== undefined) useCaseInput.status = status;
    if (tags !== undefined) useCaseInput.tags = tags;

    const documents = await searchDocumentsUseCase.execute(useCaseInput);
    return context.json(documents.map(serializeDocument), 200);
  });

  return router;
};

const parseTags = (raw: string | undefined): string[] | undefined => {
  if (raw === undefined) {
    return undefined;
  }

  return raw
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
};

const serializeDocument = (document: WikiDocument): SearchDocumentResponseEntry => {
  return {
    id: document.title.toSlug(),
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
    createdAt: null,
    updatedAt: null,
  };
};
