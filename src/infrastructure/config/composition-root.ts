import { Hono } from 'hono';

import type { DocumentSummaryGenerator } from '../../application/ports/document-summary-generator.js';
import { SummaryGeneratorNotConfiguredError } from '../../application/errors/summary-generator-not-configured-error.js';
import { ListIndexUseCase } from '../../application/use-cases/list-index.js';
import { SaveDocumentUseCase } from '../../application/use-cases/save-document.js';
import { createDocumentsRouter } from '../http/routes/documents.js';
import { createIndexRouter } from '../http/routes/index.js';
import { OpenRouterDocumentSummaryGenerator } from '../llm/openrouter-document-summary-generator.js';
import { InMemoryDocumentRepository } from '../persistence/in-memory/in-memory-document-repository.js';
import { InMemoryIndexCatalog } from '../persistence/in-memory/in-memory-index-catalog.js';

type OpenRouterOptions = {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  siteUrl?: string;
  appName?: string;
  summaryGenerator?: DocumentSummaryGenerator;
};

type CreateAppOptions = {
  maxRequestBytes?: number;
  maxStoredDocuments?: number;
  maxStoredBytes?: number;
  openRouter?: OpenRouterOptions;
};

class SummaryRequiredDocumentSummaryGenerator implements DocumentSummaryGenerator {
  async generate(): Promise<string> {
    throw new SummaryGeneratorNotConfiguredError();
  }
}

export const createApp = (options: CreateAppOptions = {}): Hono => {
  const openRouterOptions = options.openRouter;
  const documentRepository = new InMemoryDocumentRepository({
    maxStoredDocuments: options.maxStoredDocuments,
    maxStoredBytes: options.maxStoredBytes,
  });
  const indexCatalog = new InMemoryIndexCatalog();
  const openRouterApiKey = openRouterOptions?.apiKey ?? process.env.OPENROUTER_API_KEY;
  const openRouterModel = openRouterOptions?.model ?? process.env.OPENROUTER_MODEL ?? 'openai/gpt-4o-mini';
  const documentSummaryGenerator =
    openRouterOptions?.summaryGenerator ??
    (openRouterApiKey
      ? new OpenRouterDocumentSummaryGenerator({
          apiKey: openRouterApiKey,
          model: openRouterModel,
          baseUrl: openRouterOptions?.baseUrl,
          siteUrl: openRouterOptions?.siteUrl,
          appName: openRouterOptions?.appName,
        })
      : new SummaryRequiredDocumentSummaryGenerator());
  const saveDocumentUseCase = new SaveDocumentUseCase(documentRepository, indexCatalog, documentSummaryGenerator);
  const listIndexUseCase = new ListIndexUseCase(indexCatalog);

  const app = new Hono();

  app.onError(() => {
    return new Response(JSON.stringify({ message: 'internal_error' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  });

  app.get('/', (context) => {
    return context.html(renderHomePage());
  });

  app.route(
    '/documents',
    createDocumentsRouter({
      saveDocumentUseCase,
      maxRequestBytes: options.maxRequestBytes ?? 64 * 1024,
    }),
  );
  app.route('/index', createIndexRouter({ listIndexUseCase }));

  return app;
};

const renderHomePage = (): string => {
  return `<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>LLM Wiki</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f6f7fb;
        --panel: rgba(255, 255, 255, 0.88);
        --line: rgba(15, 23, 42, 0.1);
        --text: #0f172a;
        --muted: #5b6474;
        --accent: #2563eb;
        --accent-soft: rgba(37, 99, 235, 0.12);
        --shadow: 0 24px 60px rgba(15, 23, 42, 0.1);
      }

      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif;
        background:
          radial-gradient(circle at top, rgba(37, 99, 235, 0.08), transparent 38%),
          linear-gradient(180deg, #ffffff 0%, var(--bg) 100%);
        color: var(--text);
      }

      .shell {
        width: min(1120px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 48px 0 56px;
      }

      .hero {
        display: grid;
        gap: 22px;
        justify-items: center;
        text-align: center;
        margin-bottom: 28px;
      }

      .badge {
        padding: 8px 14px;
        border-radius: 999px;
        background: rgba(255,255,255,0.86);
        border: 1px solid var(--line);
        color: var(--muted);
        font-size: 13px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      h1 {
        margin: 0;
        font-size: clamp(52px, 8vw, 88px);
        line-height: 0.95;
        letter-spacing: -0.05em;
        font-weight: 700;
      }

      .subtitle {
        margin: 0;
        max-width: 720px;
        color: var(--muted);
        font-size: 18px;
        line-height: 1.7;
      }

      .layout {
        display: grid;
        grid-template-columns: minmax(0, 1.45fr) minmax(320px, 0.9fr);
        gap: 22px;
      }

      .panel {
        background: var(--panel);
        border: 1px solid rgba(255,255,255,0.65);
        border-radius: 28px;
        box-shadow: var(--shadow);
        backdrop-filter: blur(18px);
      }

      .editor-panel { padding: 26px; }
      .side-panel { padding: 24px; display: grid; gap: 18px; }

      .panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 18px;
      }

      .panel-title {
        margin: 0;
        font-size: 24px;
        letter-spacing: -0.03em;
      }

      .panel-note {
        color: var(--muted);
        font-size: 14px;
      }

      .editor-grid { display: grid; gap: 14px; }

      label {
        display: grid;
        gap: 8px;
        font-size: 14px;
        color: var(--muted);
      }

      input, textarea {
        width: 100%;
        border: 1px solid var(--line);
        border-radius: 18px;
        background: rgba(255,255,255,0.88);
        color: var(--text);
        font: inherit;
        padding: 16px 18px;
        transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
      }

      input:focus, textarea:focus {
        outline: none;
        border-color: rgba(37, 99, 235, 0.35);
        box-shadow: 0 0 0 5px var(--accent-soft);
        transform: translateY(-1px);
      }

      input { font-size: 18px; font-weight: 600; }
      textarea {
        min-height: 360px;
        resize: vertical;
        line-height: 1.7;
        font-family: "SFMono-Regular", "Consolas", "Liberation Mono", monospace;
      }

      .actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        margin-top: 8px;
        flex-wrap: wrap;
      }

      button {
        border: 0;
        border-radius: 999px;
        padding: 14px 22px;
        background: linear-gradient(135deg, #1d4ed8, #2563eb 58%, #60a5fa);
        color: white;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
        box-shadow: 0 16px 32px rgba(37, 99, 235, 0.28);
      }

      button:disabled { cursor: wait; opacity: 0.7; }

      .helper {
        color: var(--muted);
        font-size: 13px;
      }

      .card {
        border: 1px solid var(--line);
        border-radius: 22px;
        background: rgba(255,255,255,0.74);
        padding: 18px;
      }

      .card h3 {
        margin: 0 0 10px;
        font-size: 17px;
        letter-spacing: -0.02em;
      }

      .summary {
        margin: 0;
        color: var(--text);
        line-height: 1.65;
      }

      .meta {
        margin-top: 12px;
        color: var(--muted);
        font-size: 13px;
      }

      .empty {
        color: var(--muted);
        font-size: 14px;
        line-height: 1.7;
      }

      .index-list {
        display: grid;
        gap: 12px;
      }

      .index-item {
        padding: 14px 16px;
        border-radius: 18px;
        background: rgba(248, 250, 252, 0.92);
        border: 1px solid rgba(15, 23, 42, 0.06);
      }

      .index-item strong { display: block; margin-bottom: 6px; }
      .index-item p { margin: 0; color: var(--muted); line-height: 1.55; font-size: 14px; }

      @media (max-width: 960px) {
        .layout { grid-template-columns: 1fr; }
        .shell { padding-top: 28px; }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="hero">
        <div class="badge">Knowledge workspace</div>
        <h1>LLM Wiki</h1>
        <p class="subtitle">질문보다 기록을 먼저. 문서를 가볍게 남기면, 요약과 인덱스 반영까지 이어지는 가장 단순한 홈 화면입니다.</p>
      </section>

      <section class="layout">
        <section class="panel editor-panel">
          <div class="panel-header">
            <div>
              <h2 class="panel-title">Write</h2>
              <div class="panel-note">제목과 마크다운 본문만 입력하면 저장 시 summary가 자동 생성됩니다.</div>
            </div>
          </div>

          <form id="write-form" class="editor-grid">
            <label>
              Title
              <input id="title-input" name="title" type="text" placeholder="예: 배송비 정책" required />
            </label>

            <label>
              Markdown
              <textarea id="content-input" name="content" placeholder="# 문서 제목\n핵심 내용과 규칙을 자유롭게 적어주세요." required></textarea>
            </label>

            <div class="actions">
              <button id="save-button" type="submit">저장하고 요약 만들기</button>
              <span class="helper">현재 연결: <code>POST /documents</code> → <code>GET /index</code></span>
            </div>
          </form>
        </section>

        <aside class="side-panel">
          <section id="result-panel" class="card">
            <h3>저장 결과</h3>
            <p class="empty">아직 저장된 결과가 없습니다. 제목과 마크다운을 입력한 뒤 저장해보세요.</p>
          </section>

          <section class="card">
            <h3>최근 인덱스</h3>
            <div id="index-list" class="index-list">
              <p class="empty">아직 인덱스 항목이 없습니다.</p>
            </div>
          </section>
        </aside>
      </section>
    </main>

    <script>
      const form = document.getElementById('write-form');
      const titleInput = document.getElementById('title-input');
      const contentInput = document.getElementById('content-input');
      const saveButton = document.getElementById('save-button');
      const resultPanel = document.getElementById('result-panel');
      const indexList = document.getElementById('index-list');

      const renderResult = (payload, isError = false) => {
        if (isError) {
          resultPanel.innerHTML = '<h3>저장 결과</h3>' +
            '<p class="summary">요청이 실패했습니다.</p>' +
            '<div class="meta">' + payload.message + '</div>';
          return;
        }

        resultPanel.innerHTML = '<h3>' + payload.title + '</h3>' +
          '<p class="summary">' + payload.summary + '</p>' +
          '<div class="meta">status: ' + payload.status + '</div>';
      };

      const renderIndex = (entries) => {
        if (!entries.length) {
          indexList.innerHTML = '<p class="empty">아직 인덱스 항목이 없습니다.</p>';
          return;
        }

        indexList.innerHTML = entries.map((entry) =>
          '<article class="index-item">' +
            '<strong>' + entry.title + '</strong>' +
            '<p>' + entry.summary + '</p>' +
          '</article>'
        ).join('');
      };

      const refreshIndex = async () => {
        const response = await fetch('/index');
        const entries = await response.json();
        renderIndex(entries);
      };

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        saveButton.disabled = true;
        saveButton.textContent = '저장 중...';

        try {
          const response = await fetch('/documents', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              title: titleInput.value,
              content: contentInput.value,
            }),
          });

          const payload = await response.json();

          if (!response.ok) {
            renderResult(payload, true);
            return;
          }

          renderResult(payload);
          await refreshIndex();
        } catch (error) {
          renderResult({ message: '네트워크 오류가 발생했습니다.' }, true);
        } finally {
          saveButton.disabled = false;
          saveButton.textContent = '저장하고 요약 만들기';
        }
      });

      refreshIndex();
    </script>
  </body>
</html>`;
};
