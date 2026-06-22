import { describe, expect, it } from 'vitest';

import { createApp } from '../../../src/infrastructure/config/composition-root.js';

describe('GET /', () => {
  it('returns the Google-like home page with editor and save surfaces', async () => {
    const app = createApp();

    const response = await app.request('/');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');

    const html = await response.text();

    expect(html).toContain('LLM Wiki');
    expect(html).toContain('id="title-input"');
    expect(html).toContain('id="content-input"');
    expect(html).toContain('id="save-button"');
    expect(html).toContain('id="result-panel"');
    expect(html).toContain('id="index-list"');
    expect(html).toContain('EasyMDE'); // 마크다운 에디터 확인
    expect(html).toContain('data-tab="write"'); // 탭 메뉴 확인
    expect(html).toContain('data-tab="browse"');
    expect(html).toContain('data-tab="results"');
  });
});
