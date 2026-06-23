import { describe, expect, it } from 'vitest';

import { createApp } from '../../../src/infrastructure/config/composition-root.js';

describe('GET /index', () => {
  it('returns sorted index entries with status and domain', async () => {
    const app = createApp();

    await app.request('/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Foo', summary: 'About Foo' }),
    });
    await app.request('/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Bar', summary: 'About Bar' }),
    });

    const response = await app.request('/index');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      {
        title: 'Bar',
        summary: 'About Bar',
        sourceCount: 0,
        status: 'draft',
        domain: null,
      },
      {
        title: 'Foo',
        summary: 'About Foo',
        sourceCount: 0,
        status: 'draft',
        domain: null,
      },
    ]);
  });
});
