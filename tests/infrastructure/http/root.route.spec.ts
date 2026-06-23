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
    expect(html).toContain('id="index-list"');
    expect(html).toContain('EasyMDE'); // 마크다운 에디터 확인
    expect(html).toContain('data-tab="write"'); // 탭 메뉴 확인
    expect(html).toContain('data-tab="browse"');
    expect(html).toContain('data-tab="ask-ai"');
  });

  it('exposes Browse tab search & filter UI surfaces', async () => {
    const app = createApp();

    const response = await app.request('/');
    const html = await response.text();

    expect(html).toContain('id="search-input"');
    expect(html).toContain('id="filter-bar"');

    expect(html).toContain('id="status-chips"');
    expect(html).toContain('id="domain-chips"');
    expect(html).toContain('id="tag-chips"');

    expect(html).toContain('data-status="draft"');
    expect(html).toContain('data-status="review"');
    expect(html).toContain('data-status="published"');

    expect(html).toContain('id="results-count"');
    expect(html).toContain('id="clear-filters"');

    expect(html).toContain('/documents/search');

    expect(html).toContain('badge--status-draft');
    expect(html).toContain('badge--status-review');
    expect(html).toContain('badge--status-published');
    expect(html).toContain('badge--domain');
    expect(html).toContain('badge--tag');
  });
});
