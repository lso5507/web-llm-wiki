import { once } from 'node:events';

import { afterEach, describe, expect, it } from 'vitest';

import { createNodeServer } from '../../../src/infrastructure/http/server.js';

describe('createNodeServer', () => {
  const servers: Array<{ close: () => void }> = [];

  afterEach(() => {
    for (const server of servers) {
      server.close();
    }
    servers.length = 0;
  });

  it('serves the Hono app over a real HTTP socket', async () => {
    const server = createNodeServer();
    servers.push(server);

    server.listen(0);
    await once(server, 'listening');

    const address = server.address();

    if (!address || typeof address === 'string') {
      throw new Error('Expected an ephemeral TCP port');
    }

    const response = await fetch(`http://127.0.0.1:${address.port}/index`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  it('serves a non-404 response on the root path', async () => {
    const server = createNodeServer();
    servers.push(server);

    server.listen(0);
    await once(server, 'listening');

    const address = server.address();

    if (!address || typeof address === 'string') {
      throw new Error('Expected an ephemeral TCP port');
    }

    const response = await fetch(`http://127.0.0.1:${address.port}/`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    const html = await response.text();

    expect(html).toContain('LLM Wiki');
    expect(html).toContain('name="title"');
    expect(html).toContain('name="content"');
    expect(html).toContain('id="save-button"');
  });
});
