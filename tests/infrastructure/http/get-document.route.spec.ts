import { describe, expect, it } from 'vitest';

import { createApp } from '../../../src/infrastructure/config/composition-root.js';

describe('GET /documents/:id', () => {
  it('returns 200 with the saved document for a known id', async () => {
    const app = createApp();

    const createResponse = await app.request('/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Orenz Test Account',
        summary: 'Test account credentials',
        content: '# body',
        tags: ['orenz', 'wiki'],
      }),
    });
    expect(createResponse.status).toBe(201);

    const response = await app.request('/documents/orenz-test-account');

    expect(response.status).toBe(200);

    const payload = (await response.json()) as Record<string, unknown>;

    expect(payload.id).toBe('orenz-test-account');
    expect(payload.title).toBe('Orenz Test Account');
    expect(payload.content).toBe('# body');
    expect(payload.tags).toEqual(['orenz', 'wiki']);
    expect(payload.conflict).toBe(false);
    expect(payload.semanticConflicts).toEqual([]);
    expect(payload.sources).toEqual([]);
    expect(payload.links).toEqual({ outbound: [], broken: [] });
    expect(Object.keys(payload).sort()).toEqual(
      [
        'conflict',
        'conflictWith',
        'content',
        'createdAt',
        'domain',
        'id',
        'links',
        'parentSlug',
        'semanticConflicts',
        'sources',
        'status',
        'summary',
        'tags',
        'title',
        'updatedAt',
      ].sort(),
    );
  });

  it('returns default-shaped fields when the document was saved without optional metadata', async () => {
    const app = createApp();

    await app.request('/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Foo', summary: 'About Foo' }),
    });

    const response = await app.request('/documents/foo');
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(payload.id).toBe('foo');
    expect(payload.title).toBe('Foo');
    expect(payload.tags).toEqual([]);
    expect(payload.sources).toEqual([]);
    expect(payload.conflict).toBe(false);
    expect(payload.conflictWith).toEqual([]);
    expect(payload.semanticConflicts).toEqual([]);
    expect(payload.summary).toBe('');
    expect(payload.status).toBe('published');
    expect(payload.domain).toBeNull();
    expect(payload.createdAt).toBeNull();
    expect(payload.updatedAt).toBeNull();
    expect(payload.content).toBe('');
    expect(payload.links).toEqual({ outbound: [], broken: [] });
  });

  it('returns 404 when no document exists for the given id', async () => {
    const app = createApp();

    const response = await app.request('/documents/missing-doc');

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: 'Document not found',
      id: 'missing-doc',
    });
  });

  it('looks up by slug, not by raw title', async () => {
    const app = createApp();

    await app.request('/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Slug Lookup Test', summary: 'about' }),
    });

    const wrongCase = await app.request('/documents/Slug%20Lookup%20Test');
    expect(wrongCase.status).toBe(404);

    const correct = await app.request('/documents/slug-lookup-test');
    expect(correct.status).toBe(200);
  });
});
