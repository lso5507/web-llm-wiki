import { describe, expect, it } from 'vitest';

import { createApp } from '../../../src/infrastructure/config/composition-root.js';

describe('POST /documents', () => {
  it('returns 201 for a valid payload', async () => {
    const app = createApp();

    const response = await app.request('/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Foo', summary: 'About Foo' }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      title: 'Foo',
      summary: 'About Foo',
      status: 'completed',
      parentSlug: null,
    });
  });

  it('ignores manual parentSlug input in the write flow', async () => {
    const app = createApp();

    const response = await app.request('/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Child',
        summary: 'About child',
        parentSlug: 'manual-parent',
      }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      title: 'Child',
      summary: 'About child',
      status: 'completed',
      parentSlug: null,
    });
  });

  it('returns 201 with an auto-generated summary when summary is omitted', async () => {
    const app = createApp({
      openRouter: {
        apiKey: 'test-key',
        model: 'openai/gpt-4o-mini',
        summaryGenerator: {
          async generate() {
            return {
              summary: 'Generated summary',
              domain: null,
              confidence: 1.0,
            };
          },
        },
      },
    });

    const response = await app.request('/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Foo', content: 'Raw markdown body' }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      title: 'Foo',
      summary: 'Generated summary',
      status: 'completed',
      parentSlug: null,
    });
  });

  it('returns 400 for an invalid title', async () => {
    const app = createApp();

    const response = await app.request('/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '   ', summary: 'About Foo' }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: 'Title must not be empty' });
  });

  it('returns 400 for an empty summary', async () => {
    const app = createApp();

    const response = await app.request('/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Foo', summary: '   ' }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: 'Index entry summary must not be empty' });
  });

  it('returns 400 when summary is omitted and content is missing', async () => {
    const app = createApp({
      openRouter: {
        apiKey: 'test-key',
        model: 'openai/gpt-4o-mini',
        summaryGenerator: {
          async generate() {
            return {
              summary: 'Generated summary',
              domain: null,
              confidence: 1.0,
            };
          },
        },
      },
    });

    const response = await app.request('/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Foo' }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: 'content is required when summary is omitted' });
  });

  it('returns 400 for malformed JSON', async () => {
    const app = createApp();

    const response = await app.request('/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"title":',
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: 'Request body must be valid JSON' });
  });

  it('returns 413 when the request body exceeds the configured limit', async () => {
    const app = createApp({ maxRequestBytes: 20 });

    const response = await app.request('/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Foo', summary: 'About Foo' }),
    });

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ message: 'Request body exceeds the 20 byte limit' });
  });

  it('returns 503 when storage capacity is exhausted', async () => {
    const app = createApp({ maxStoredDocuments: 1, maxStoredBytes: 12_000 });

    const firstResponse = await app.request('/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'First', summary: 'About first', content: '123456' }),
    });
    const secondResponse = await app.request('/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Second', summary: 'About second', content: '123456' }),
    });

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(503);
    expect(await secondResponse.json()).toEqual({ message: 'In-memory document storage limit exceeded' });
  });
});
