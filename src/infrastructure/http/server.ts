import { createServer, type Server } from 'node:http';
import { Readable } from 'node:stream';

import type { Hono } from 'hono';

import { createApp } from '../config/composition-root.js';

export { createApp } from '../config/composition-root.js';

export const createNodeServer = (app: Hono = createApp()): Server => {
  return createServer(async (incomingMessage, serverResponse) => {
    const url = new URL(incomingMessage.url ?? '/', `http://${incomingMessage.headers.host ?? '127.0.0.1'}`);
    const requestInit: RequestInit & { duplex: 'half' } = {
      method: incomingMessage.method,
      headers: new Headers(toHeaderEntries(incomingMessage.headers)),
      body: shouldAttachBody(incomingMessage.method)
        ? (Readable.toWeb(incomingMessage) as ReadableStream)
        : undefined,
      duplex: 'half',
    };
    const request = new Request(url, requestInit);

    const response = await app.fetch(request);

    serverResponse.statusCode = response.status;
    response.headers.forEach((value, key) => {
      serverResponse.setHeader(key, value);
    });

    if (!response.body) {
      serverResponse.end();
      return;
    }

    for await (const chunk of response.body) {
      serverResponse.write(Buffer.from(chunk));
    }

    serverResponse.end();
  });
};

const shouldAttachBody = (method: string | undefined): boolean => {
  return method !== 'GET' && method !== 'HEAD';
};

const toHeaderEntries = (headers: NodeJS.Dict<string | string[]>): Array<[string, string]> => {
  const entries: Array<[string, string]> = [];

  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) {
      continue;
    }

    entries.push([key, Array.isArray(value) ? value.join(', ') : value]);
  }

  return entries;
};
