import { describe, expect, it } from 'vitest';

import { createApp } from '../../../src/infrastructure/config/composition-root.js';

describe('DELETE /documents/:id', () => {
  it('returns 204 and removes the document', async () => {
    const app = createApp();
    await app.request('/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Foo Bar', summary: 'summary' }),
    });

    const response = await app.request('/documents/foo-bar', {
      method: 'DELETE',
    });

    expect(response.status).toBe(204);

    const reloaded = await app.request('/documents/foo-bar');
    expect(reloaded.status).toBe(404);
  });

  it('removes the corresponding index entry', async () => {
    const app = createApp();
    await app.request('/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Foo Bar', summary: 'summary' }),
    });

    await app.request('/documents/foo-bar', { method: 'DELETE' });

    const indexResponse = await app.request('/index');
    expect(await indexResponse.json()).toEqual([]);
  });

  it('removes both the document and the index entry in a single call', async () => {
    const app = createApp();
    await app.request('/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Combined Cleanup', summary: 'summary' }),
    });

    const beforeIndex = (await (await app.request('/index')).json()) as Array<{ title: string }>;
    expect(beforeIndex.map((entry) => entry.title)).toContain('Combined Cleanup');

    const response = await app.request('/documents/combined-cleanup', {
      method: 'DELETE',
    });
    expect(response.status).toBe(204);

    const documentResponse = await app.request('/documents/combined-cleanup');
    expect(documentResponse.status).toBe(404);

    const indexResponse = await app.request('/index');
    const entries = (await indexResponse.json()) as Array<{ title: string }>;
    expect(entries.map((entry) => entry.title)).not.toContain('Combined Cleanup');
  });

  it('is idempotent and returns 204 even when the id does not exist', async () => {
    const app = createApp();

    const response = await app.request('/documents/never-existed', {
      method: 'DELETE',
    });

    expect(response.status).toBe(204);
  });

  it('is idempotent when DELETE is called twice on the same existing document', async () => {
    const app = createApp();
    await app.request('/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Twice Deleted', summary: 'summary' }),
    });

    const first = await app.request('/documents/twice-deleted', { method: 'DELETE' });
    const second = await app.request('/documents/twice-deleted', { method: 'DELETE' });

    expect(first.status).toBe(204);
    expect(second.status).toBe(204);

    const documentResponse = await app.request('/documents/twice-deleted');
    expect(documentResponse.status).toBe(404);

    const indexResponse = await app.request('/index');
    expect(await indexResponse.json()).toEqual([]);
  });

  it('only deletes the targeted document', async () => {
    const app = createApp();
    await app.request('/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Keep Me', summary: 'keep' }),
    });
    await app.request('/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Remove Me', summary: 'remove' }),
    });

    const response = await app.request('/documents/remove-me', {
      method: 'DELETE',
    });

    expect(response.status).toBe(204);

    const indexResponse = await app.request('/index');
    const entries = (await indexResponse.json()) as Array<{ title: string }>;
    expect(entries.map((entry) => entry.title)).toEqual(['Keep Me']);
  });
});
