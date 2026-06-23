import { describe, expect, it } from 'vitest';

import { createApp } from '../../../src/infrastructure/config/composition-root.js';

const seedDocument = async (
  app: ReturnType<typeof createApp>,
  payload: {
    title: string;
    summary?: string;
    content?: string;
    tags?: string[];
    domain?: string | null;
    status?: string;
    id?: string;
  },
): Promise<void> => {
  const createResponse = await app.request('/documents', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: payload.title,
      summary: payload.summary ?? `summary for ${payload.title}`,
      content: payload.content,
      tags: payload.tags,
    }),
  });
  expect(createResponse.status).toBe(201);

  if (payload.status !== undefined || payload.domain !== undefined) {
    const id = payload.id ?? payload.title.toLowerCase().replace(/\s+/g, '-');
    const updateBody: Record<string, unknown> = {};
    if (payload.status !== undefined) updateBody.status = payload.status;
    if (payload.domain !== undefined) updateBody.domain = payload.domain;

    const updateResponse = await app.request(`/documents/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(updateBody),
    });
    expect(updateResponse.status).toBe(200);
  }
};

describe('GET /documents/search', () => {
  describe('with no filters', () => {
    it('returns 200 with all documents', async () => {
      const app = createApp();
      await seedDocument(app, { title: 'Alpha' });
      await seedDocument(app, { title: 'Beta' });

      const response = await app.request('/documents/search');

      expect(response.status).toBe(200);
      const payload = (await response.json()) as Array<Record<string, unknown>>;
      expect(Array.isArray(payload)).toBe(true);
      expect(payload).toHaveLength(2);
      const titles = payload.map((entry) => entry.title).sort();
      expect(titles).toEqual(['Alpha', 'Beta']);
    });

    it('returns 200 with [] when no documents exist', async () => {
      const app = createApp();

      const response = await app.request('/documents/search');

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([]);
    });
  });

  describe('response shape', () => {
    it('serializes each document with id, title, status, domain, tags, summary fields', async () => {
      const app = createApp();
      await seedDocument(app, {
        title: 'Sample Doc',
        content: 'body',
        tags: ['react', 'frontend'],
        status: 'review',
      });

      const response = await app.request('/documents/search');
      const payload = (await response.json()) as Array<Record<string, unknown>>;

      expect(payload).toHaveLength(1);
      const entry = payload[0];
      expect(entry.id).toBe('sample-doc');
      expect(entry.title).toBe('Sample Doc');
      expect(entry.status).toBe('review');
      expect(entry.domain).toBeNull();
      expect(entry.tags).toEqual(['react', 'frontend']);
      expect(entry.semanticConflicts).toEqual([]);
      expect(typeof entry.summary).toBe('string');
    });
  });

  describe('query filter', () => {
    it('filters documents whose title or content contains the query (case-insensitive)', async () => {
      const app = createApp();
      await seedDocument(app, { title: 'TypeScript Guide', content: 'about types' });
      await seedDocument(app, { title: 'Python Cookbook', content: 'about python' });
      await seedDocument(app, { title: 'Other', content: 'mentions TypeScript briefly' });

      const response = await app.request('/documents/search?query=typescript');

      expect(response.status).toBe(200);
      const payload = (await response.json()) as Array<Record<string, unknown>>;
      const titles = payload.map((entry) => entry.title).sort();
      expect(titles).toEqual(['Other', 'TypeScript Guide']);
    });

    it('returns 200 with [] when query matches no documents', async () => {
      const app = createApp();
      await seedDocument(app, { title: 'Alpha', content: 'body' });

      const response = await app.request('/documents/search?query=nonexistent');

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([]);
    });
  });

  describe('domain filter', () => {
    it('filters documents by exact domain match', async () => {
      const app = createApp();
      await seedDocument(app, { title: 'A', content: 'body', domain: 'tech-stack' });
      await seedDocument(app, { title: 'B', content: 'body', domain: 'product' });

      const response = await app.request('/documents/search?domain=tech-stack');

      expect(response.status).toBe(200);
      const payload = (await response.json()) as Array<Record<string, unknown>>;
      expect(payload).toHaveLength(1);
      expect(payload[0].title).toBe('A');
    });
  });

  describe('status filter', () => {
    it('filters documents by exact status match', async () => {
      const app = createApp();
      await seedDocument(app, { title: 'A', content: 'body', status: 'draft' });
      await seedDocument(app, { title: 'B', content: 'body', status: 'review' });

      const response = await app.request('/documents/search?status=review');

      expect(response.status).toBe(200);
      const payload = (await response.json()) as Array<Record<string, unknown>>;
      expect(payload).toHaveLength(1);
      expect(payload[0].title).toBe('B');
    });
  });

  describe('tags filter', () => {
    it('parses comma-separated tags and filters by AND-subset match', async () => {
      const app = createApp();
      await seedDocument(app, { title: 'A', tags: ['react', 'frontend'] });
      await seedDocument(app, { title: 'B', tags: ['react'] });
      await seedDocument(app, { title: 'C', tags: ['react', 'frontend', 'extra'] });

      const response = await app.request('/documents/search?tags=react,frontend');

      expect(response.status).toBe(200);
      const payload = (await response.json()) as Array<Record<string, unknown>>;
      const titles = payload.map((entry) => entry.title).sort();
      expect(titles).toEqual(['A', 'C']);
    });

    it('treats whitespace-padded tags correctly', async () => {
      const app = createApp();
      await seedDocument(app, { title: 'A', tags: ['react', 'frontend'] });

      const response = await app.request('/documents/search?tags=react,%20frontend');

      expect(response.status).toBe(200);
      const payload = (await response.json()) as Array<Record<string, unknown>>;
      expect(payload).toHaveLength(1);
      expect(payload[0].title).toBe('A');
    });
  });

  describe('combined filters', () => {
    it('applies all query parameters with AND semantics', async () => {
      const app = createApp();
      await seedDocument(app, {
        title: 'React Hooks',
        content: 'about hooks',
        tags: ['react', 'frontend'],
        status: 'published',
        domain: 'tech-stack',
      });
      await seedDocument(app, {
        title: 'React Routing',
        content: 'about routing',
        tags: ['react', 'frontend'],
        status: 'draft',
        domain: 'tech-stack',
      });

      const response = await app.request(
        '/documents/search?query=react&status=published&domain=tech-stack&tags=frontend',
      );

      expect(response.status).toBe(200);
      const payload = (await response.json()) as Array<Record<string, unknown>>;
      expect(payload).toHaveLength(1);
      expect(payload[0].title).toBe('React Hooks');
    });
  });

  describe('route resolution', () => {
    it('does not collide with GET /documents/:id (search is a sibling, not a doc id)', async () => {
      const app = createApp();
      await seedDocument(app, { title: 'Search', content: 'a doc literally titled Search' });

      const response = await app.request('/documents/search');

      expect(response.status).toBe(200);
      const payload = (await response.json()) as unknown;
      expect(Array.isArray(payload)).toBe(true);
    });
  });
});
