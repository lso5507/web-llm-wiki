import { describe, expect, it } from 'vitest';

import { createApp } from '../../../src/infrastructure/config/composition-root.js';

describe('document save flow', () => {
  it('saves a document and exposes it through the index', async () => {
    const app = createApp();

    const createResponse = await app.request('/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Orenz Test Account', summary: 'Test account credentials' }),
    });
    const indexResponse = await app.request('/index');

    expect(createResponse.status).toBe(201);
    expect(await indexResponse.json()).toEqual([
      {
        title: 'Orenz Test Account',
        summary: 'Test account credentials',
        sourceCount: 0,
      },
    ]);
  });
});
