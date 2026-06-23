import { describe, expect, it } from 'vitest';

import { createApp } from '../../../src/infrastructure/config/composition-root.js';

describe('PUT /documents/:id', () => {
  it('updates a document and returns 200 with the updated payload', async () => {
    const app = createApp();
    await app.request('/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Foo Bar', summary: 'old summary', content: 'old content' }),
    });

    const response = await app.request('/documents/foo-bar', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'new content', tags: ['fresh'] }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      id: 'foo-bar',
      title: 'Foo Bar',
      content: 'new content',
      tags: ['fresh'],
    });
  });

  it('updates a document title and re-keys it under the new id', async () => {
    const app = createApp();
    await app.request('/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Foo Bar', summary: 'summary' }),
    });

    const response = await app.request('/documents/foo-bar', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Foo Baz' }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.id).toBe('foo-baz');
    expect(body.title).toBe('Foo Baz');

    const reloaded = await app.request('/documents/foo-baz');
    expect(reloaded.status).toBe(200);
  });

  it('returns 404 when the document does not exist', async () => {
    const app = createApp();

    const response = await app.request('/documents/missing-doc', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'whatever' }),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Document not found', id: 'missing-doc' });
  });

  it('returns 400 for an empty title', async () => {
    const app = createApp();
    await app.request('/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Foo Bar', summary: 'summary' }),
    });

    const response = await app.request('/documents/foo-bar', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '   ' }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: 'Title must not be empty' });
  });

  it('returns 400 for malformed JSON', async () => {
    const app = createApp();
    await app.request('/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Foo Bar', summary: 'summary' }),
    });

    const response = await app.request('/documents/foo-bar', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: '{"title":',
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: 'Request body must be valid JSON' });
  });

  it('returns 400 when tags is not a string array', async () => {
    const app = createApp();
    await app.request('/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Foo Bar', summary: 'summary' }),
    });

    const response = await app.request('/documents/foo-bar', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tags: [1, 2, 3] }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: 'tags must be an array of strings when provided' });
  });

  it('updates the status and reflects it in the response and on reload', async () => {
    const app = createApp();
    await app.request('/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Foo Bar', summary: 'summary' }),
    });

    const response = await app.request('/documents/foo-bar', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'review' }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.status).toBe('review');

    const reloaded = await app.request('/documents/foo-bar');
    const reloadedBody = (await reloaded.json()) as Record<string, unknown>;
    expect(reloadedBody.status).toBe('review');
  });

  it('updates the domain and reflects it in the response and on reload', async () => {
    const app = createApp();
    await app.request('/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Foo Bar', summary: 'summary' }),
    });

    const response = await app.request('/documents/foo-bar', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ domain: 'tech-stack' }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.domain).toBe('tech-stack');

    const reloaded = await app.request('/documents/foo-bar');
    const reloadedBody = (await reloaded.json()) as Record<string, unknown>;
    expect(reloadedBody.domain).toBe('tech-stack');
  });

  it('returns 400 for an invalid status value', async () => {
    const app = createApp();
    await app.request('/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Foo Bar', summary: 'summary' }),
    });

    const response = await app.request('/documents/foo-bar', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'not-a-status' }),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, unknown>;
    expect(typeof body.message).toBe('string');
    expect(body.message as string).toMatch(/Invalid status/);
  });

  it('returns 400 for an invalid domain value', async () => {
    const app = createApp();
    await app.request('/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Foo Bar', summary: 'summary' }),
    });

    const response = await app.request('/documents/foo-bar', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ domain: 'NotKebab' }),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, unknown>;
    expect(typeof body.message).toBe('string');
    expect(body.message as string).toMatch(/Invalid domain/);
  });
});
