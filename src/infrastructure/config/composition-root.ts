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
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/easymde/dist/easymde.min.css">
    <style>
      :root {
        color-scheme: light;
        --bg: #fafbfc;
        --panel: #ffffff;
        --line: rgba(15, 23, 42, 0.08);
        --text: #0f172a;
        --muted: #64748b;
        --accent: #2563eb;
        --accent-soft: rgba(37, 99, 235, 0.1);
        --shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
      }

      * { box-sizing: border-box; margin: 0; padding: 0; }
      
      body {
        margin: 0;
        min-height: 100vh;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        background: var(--bg);
        color: var(--text);
      }

      /* Header */
      .header {
        position: sticky;
        top: 0;
        z-index: 100;
        background: var(--panel);
        border-bottom: 1px solid var(--line);
        padding: 12px 24px;
      }

      .logo {
        font-size: 14px;
        font-weight: 600;
        color: var(--text);
        letter-spacing: -0.02em;
      }

      /* Tabs */
      .tabs {
        display: flex;
        gap: 4px;
        background: var(--panel);
        border-bottom: 1px solid var(--line);
        padding: 0 24px;
      }

      .tab-button {
        border: 0;
        background: transparent;
        padding: 12px 16px;
        font: inherit;
        font-size: 14px;
        color: var(--muted);
        cursor: pointer;
        border-bottom: 2px solid transparent;
        transition: color 0.2s, border-color 0.2s;
      }

      .tab-button:hover {
        color: var(--text);
      }

      .tab-button.active {
        color: var(--accent);
        border-bottom-color: var(--accent);
      }

      /* Main container */
      .container {
        max-width: 900px;
        margin: 0 auto;
        padding: 32px 24px;
      }

      /* Tab content */
      .tab-content {
        display: none;
      }

      .tab-content.active {
        display: block;
      }

      /* Write tab */
      .write-section {
        display: grid;
        gap: 24px;
      }

      .input-group {
        display: grid;
        gap: 8px;
      }

      .input-group label {
        font-size: 13px;
        font-weight: 500;
        color: var(--muted);
      }

      #title-input {
        width: 100%;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--panel);
        color: var(--text);
        font: inherit;
        font-size: 24px;
        font-weight: 600;
        padding: 12px 16px;
        transition: border-color 0.2s;
      }

      #title-input:focus {
        outline: none;
        border-color: var(--accent);
      }

      #title-input::placeholder {
        color: var(--muted);
        opacity: 0.5;
      }

      /* EasyMDE customization */
      .EasyMDEContainer {
        border: 1px solid var(--line);
        border-radius: 8px;
        overflow: hidden;
      }

      .EasyMDEContainer .CodeMirror {
        min-height: 500px;
        font-size: 15px;
        line-height: 1.7;
        border: 0;
      }

      .editor-toolbar {
        border: 0;
        border-bottom: 1px solid var(--line);
        background: var(--bg);
      }

      .editor-toolbar button {
        color: var(--muted) !important;
      }

      .editor-toolbar button:hover,
      .editor-toolbar button.active {
        background: var(--accent-soft) !important;
        border-color: transparent !important;
        color: var(--accent) !important;
      }

      .CodeMirror-cursor {
        border-left-color: var(--accent);
      }

      .cm-header {
        color: var(--text);
        font-weight: 600;
      }

      .cm-link {
        color: var(--accent);
      }

      .cm-url {
        color: var(--muted);
      }

      /* Save button */
      .save-button {
        border: 0;
        border-radius: 8px;
        padding: 12px 24px;
        background: var(--accent);
        color: white;
        font: inherit;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: opacity 0.2s;
        justify-self: start;
      }

      .save-button:hover {
        opacity: 0.9;
      }

      .save-button:disabled {
        cursor: not-allowed;
        opacity: 0.6;
      }

      /* Browse tab */
      .index-list {
        display: grid;
        gap: 12px;
      }

      .index-item {
        padding: 16px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--panel);
        transition: box-shadow 0.2s;
      }

      .index-item:hover {
        box-shadow: var(--shadow);
      }

      .index-item-title {
        font-size: 16px;
        font-weight: 600;
        margin-bottom: 8px;
        color: var(--text);
      }

      .index-item-summary {
        font-size: 14px;
        color: var(--muted);
        line-height: 1.6;
      }

      /* Results tab */
      .result-card {
        padding: 24px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--panel);
      }

      .result-title {
        font-size: 20px;
        font-weight: 600;
        margin-bottom: 12px;
        color: var(--text);
      }

      .result-summary {
        font-size: 15px;
        color: var(--text);
        line-height: 1.7;
        margin-bottom: 16px;
      }

      .result-meta {
        font-size: 13px;
        color: var(--muted);
      }

      .empty-state {
        padding: 48px 24px;
        text-align: center;
        color: var(--muted);
        font-size: 14px;
      }

      @media (max-width: 768px) {
        .container {
          padding: 24px 16px;
        }
        
        .header {
          padding: 12px 16px;
        }
        
        .tabs {
          padding: 0 16px;
        }
      }
    </style>
  </head>
  <body>
    <header class="header">
      <div class="logo">LLM Wiki</div>
    </header>

    <nav class="tabs">
      <button class="tab-button active" data-tab="write">Write</button>
      <button class="tab-button" data-tab="browse">Browse</button>
      <button class="tab-button" data-tab="results">Results</button>
    </nav>

    <main class="container">
      <!-- Write Tab -->
      <section id="write-tab" class="tab-content active">
        <form id="write-form" class="write-section">
          <div class="input-group">
            <label for="title-input">제목</label>
            <input 
              id="title-input" 
              name="title" 
              type="text" 
              placeholder="문서 제목을 입력하세요" 
              required 
            />
          </div>

          <div class="input-group">
            <label for="content-input">내용</label>
            <textarea id="content-input" name="content"></textarea>
          </div>

          <button id="save-button" class="save-button" type="submit">
            저장하기
          </button>
        </form>
      </section>

      <!-- Browse Tab -->
      <section id="browse-tab" class="tab-content">
        <div id="index-list" class="index-list">
          <div class="empty-state">아직 문서가 없습니다</div>
        </div>
      </section>

      <!-- Results Tab -->
      <section id="results-tab" class="tab-content">
        <div id="result-panel">
          <div class="empty-state">저장 결과가 여기에 표시됩니다</div>
        </div>
      </section>
    </main>

    <script src="https://cdn.jsdelivr.net/npm/easymde/dist/easymde.min.js"></script>
    <script>
      // Initialize EasyMDE
      const easyMDE = new EasyMDE({
        element: document.getElementById('content-input'),
        spellChecker: false,
        autosave: {
          enabled: true,
          uniqueId: 'llm-wiki-editor',
          delay: 1000,
        },
        placeholder: '마크다운으로 내용을 작성하세요...',
        toolbar: [
          'bold', 'italic', 'heading', '|',
          'quote', 'unordered-list', 'ordered-list', '|',
          'link', 'image', 'table', '|',
          'preview', 'side-by-side', 'fullscreen', '|',
          'guide'
        ],
        status: false,
      });

      // Tab switching
      const tabButtons = document.querySelectorAll('.tab-button');
      const tabContents = document.querySelectorAll('.tab-content');

      tabButtons.forEach(button => {
        button.addEventListener('click', () => {
          const targetTab = button.dataset.tab;
          
          tabButtons.forEach(btn => btn.classList.remove('active'));
          tabContents.forEach(content => content.classList.remove('active'));
          
          button.classList.add('active');
          document.getElementById(targetTab + '-tab').classList.add('active');
        });
      });

      // Form elements
      const form = document.getElementById('write-form');
      const titleInput = document.getElementById('title-input');
      const saveButton = document.getElementById('save-button');
      const resultPanel = document.getElementById('result-panel');
      const indexList = document.getElementById('index-list');

      // Render functions
      const renderResult = (payload, isError = false) => {
        if (isError) {
          resultPanel.innerHTML = 
            '<div class="result-card">' +
              '<div class="result-title">저장 실패</div>' +
              '<div class="result-summary">' + payload.message + '</div>' +
            '</div>';
          return;
        }

        resultPanel.innerHTML = 
          '<div class="result-card">' +
            '<div class="result-title">' + payload.title + '</div>' +
            '<div class="result-summary">' + payload.summary + '</div>' +
            '<div class="result-meta">Status: ' + payload.status + '</div>' +
          '</div>';
      };

      const renderIndex = (entries) => {
        if (!entries.length) {
          indexList.innerHTML = '<div class="empty-state">아직 문서가 없습니다</div>';
          return;
        }

        indexList.innerHTML = entries.map(entry =>
          '<article class="index-item">' +
            '<div class="index-item-title">' + entry.title + '</div>' +
            '<div class="index-item-summary">' + entry.summary + '</div>' +
          '</article>'
        ).join('');
      };

      const refreshIndex = async () => {
        try {
          const response = await fetch('/index');
          const entries = await response.json();
          renderIndex(entries);
        } catch (error) {
          console.error('Failed to refresh index:', error);
        }
      };

      // Form submission
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
              content: easyMDE.value(),
            }),
          });

          const payload = await response.json();

          if (!response.ok) {
            renderResult(payload, true);
            // Switch to Results tab
            document.querySelector('[data-tab="results"]').click();
            return;
          }

          renderResult(payload);
          await refreshIndex();
          
          // Switch to Results tab
          document.querySelector('[data-tab="results"]').click();
          
          // Clear form
          titleInput.value = '';
          easyMDE.value('');
        } catch (error) {
          renderResult({ message: '네트워크 오류가 발생했습니다.' }, true);
          document.querySelector('[data-tab="results"]').click();
        } finally {
          saveButton.disabled = false;
          saveButton.textContent = '저장하기';
        }
      });

      // Initial index load
      refreshIndex();
    </script>
  </body>
</html>`;
};
