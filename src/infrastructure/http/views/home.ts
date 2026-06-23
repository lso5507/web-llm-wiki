export const renderHomePage = (): string => {
  return `<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>LLM Wiki</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/easymde/dist/easymde.min.css">
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/dompurify@3.0.6/dist/purify.min.js"></script>
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

        /* Status palette */
        --status-draft: #64748b;
        --status-draft-soft: rgba(100, 116, 139, 0.12);
        --status-review: #2563eb;
        --status-review-soft: rgba(37, 99, 235, 0.12);
        --status-published: #15803d;
        --status-published-soft: rgba(21, 128, 61, 0.12);

        /* Domain & tag */
        --domain-fg: #7c3aed;
        --domain-soft: rgba(124, 58, 237, 0.1);
        --tag-fg: #475569;
        --tag-soft: rgba(71, 85, 105, 0.08);
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
        max-width: 1280px;
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
        max-width: 760px;
        margin: 0 auto;
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

      #parent-select {
        width: 100%;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--panel);
        color: var(--text);
        font: inherit;
        font-size: 14px;
        padding: 10px 12px;
        cursor: pointer;
        transition: border-color 0.2s;
      }

      #parent-select:focus {
        outline: none;
        border-color: var(--accent);
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


      /* Browse tab — Search & Filter */
      .browse-section {
        display: grid;
        gap: 20px;
      }

      .search-bar {
        position: relative;
      }

      .search-input {
        width: 100%;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--panel);
        color: var(--text);
        font: inherit;
        font-size: 15px;
        padding: 12px 16px 12px 40px;
        transition: border-color 0.2s, box-shadow 0.2s;
      }

      .search-input:focus {
        outline: none;
        border-color: var(--accent);
        box-shadow: 0 0 0 3px var(--accent-soft);
      }

      .search-input::placeholder {
        color: var(--muted);
        opacity: 0.6;
      }

      .search-icon {
        position: absolute;
        left: 14px;
        top: 50%;
        transform: translateY(-50%);
        color: var(--muted);
        pointer-events: none;
        font-size: 14px;
      }

      .filter-bar {
        display: grid;
        gap: 14px;
        padding: 16px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--panel);
      }

      .filter-group {
        display: grid;
        gap: 8px;
      }

      .filter-label {
        font-size: 12px;
        font-weight: 600;
        color: var(--muted);
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .chip-row {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        align-items: center;
      }

      .chip {
        border: 1px solid var(--line);
        background: var(--panel);
        color: var(--text);
        font: inherit;
        font-size: 13px;
        padding: 5px 12px;
        border-radius: 999px;
        cursor: pointer;
        transition: background 0.15s, border-color 0.15s, color 0.15s;
      }

      .chip:hover {
        background: var(--accent-soft);
        border-color: var(--accent-soft);
      }

      .chip.active {
        background: var(--accent);
        border-color: var(--accent);
        color: white;
      }

      .chip.active.chip--status-draft {
        background: var(--status-draft);
        border-color: var(--status-draft);
      }

      .chip.active.chip--status-review {
        background: var(--status-review);
        border-color: var(--status-review);
      }

      .chip.active.chip--status-published {
        background: var(--status-published);
        border-color: var(--status-published);
      }

      .chip-empty {
        font-size: 13px;
        color: var(--muted);
        padding: 5px 4px;
      }

      .filter-actions {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding-top: 4px;
      }

      .results-count {
        font-size: 13px;
        color: var(--muted);
      }

      .results-count strong {
        color: var(--text);
        font-weight: 600;
      }

      .clear-button {
        border: 1px solid var(--line);
        background: var(--panel);
        color: var(--muted);
        font: inherit;
        font-size: 13px;
        padding: 6px 12px;
        border-radius: 6px;
        cursor: pointer;
        transition: color 0.15s, border-color 0.15s;
      }

      .clear-button:hover {
        color: var(--text);
        border-color: var(--text);
      }

      .clear-button:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      /* Browse — list */
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

      /* Hierarchy — tree indentation */
      .index-item--level-1 { margin-left: 0; }
      .index-item--level-2 { margin-left: 24px; }
      .index-item--level-3 { margin-left: 48px; }
      .index-item--level-4 { margin-left: 72px; }
      .index-item--level-5 { margin-left: 96px; }
      .index-item--level-6 { margin-left: 120px; }

      .index-item-toggle {
        cursor: pointer;
        user-select: none;
        margin-right: 6px;
        display: inline-block;
        width: 16px;
        text-align: center;
        font-size: 11px;
        color: var(--muted);
        transition: color 0.15s, transform 0.15s;
      }

      .index-item-toggle:hover {
        color: var(--accent);
      }

      .index-item-toggle--leaf {
        cursor: default;
        opacity: 0.3;
      }

      .index-item-toggle--leaf:hover {
        color: var(--muted);
      }

      .index-item-header {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 8px;
      }

      .index-item-title {
        font-size: 16px;
        font-weight: 600;
        color: var(--text);
        margin-right: auto;
      }

      .index-item-summary {
        font-size: 14px;
        color: var(--muted);
        line-height: 1.6;
        margin-bottom: 8px;
      }

      .index-item-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
      }

      /* Badges */
      .badge {
        display: inline-flex;
        align-items: center;
        font-size: 11px;
        font-weight: 600;
        padding: 3px 8px;
        border-radius: 4px;
        letter-spacing: 0.02em;
        text-transform: uppercase;
      }

      .badge--status-draft {
        background: var(--status-draft-soft);
        color: var(--status-draft);
      }

      .badge--status-review {
        background: var(--status-review-soft);
        color: var(--status-review);
      }

      .badge--status-published {
        background: var(--status-published-soft);
        color: var(--status-published);
      }

      .badge--domain {
        background: var(--domain-soft);
        color: var(--domain-fg);
        text-transform: none;
        letter-spacing: 0;
      }

      .badge--tag {
        background: var(--tag-soft);
        color: var(--tag-fg);
        text-transform: none;
        letter-spacing: 0;
        font-weight: 500;
      }

      /* Loading */
      .loading-state {
        padding: 32px 24px;
        text-align: center;
        color: var(--muted);
        font-size: 14px;
      }

      .loading-spinner {
        display: inline-block;
        width: 14px;
        height: 14px;
        border: 2px solid var(--line);
        border-top-color: var(--accent);
        border-radius: 50%;
        animation: spin 0.7s linear infinite;
        vertical-align: middle;
        margin-right: 6px;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      /* Browse 2-pane layout */
      .browse-layout {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr);
        gap: 24px;
        align-items: start;
      }

      .browse-list-pane {
        min-width: 0;
      }

      /* Detail Panel — sticky pane on desktop, fixed overlay on mobile */
      .detail-backdrop {
        display: none;
      }

      .detail-panel {
        position: sticky;
        top: 88px;
        max-height: calc(100vh - 110px);
        min-height: 320px;
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 8px;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .detail-panel[aria-hidden="true"] .detail-body--has-doc,
      .detail-panel[aria-hidden="true"] .detail-actions {
        display: none;
      }

      .detail-panel[aria-hidden="false"] .detail-body--empty {
        display: none;
      }

      .detail-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 20px;
        border-bottom: 1px solid var(--line);
        background: var(--panel);
        flex-shrink: 0;
      }

      .detail-close {
        border: 0;
        background: transparent;
        font-size: 20px;
        line-height: 1;
        color: var(--muted);
        cursor: pointer;
        padding: 4px 8px;
        border-radius: 4px;
        transition: background 0.15s, color 0.15s;
      }

      .detail-close:hover {
        background: var(--accent-soft);
        color: var(--accent);
      }

      .detail-header-label {
        font-size: 12px;
        font-weight: 600;
        color: var(--muted);
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .detail-body {
        flex: 1;
        overflow-y: auto;
        padding: 20px 24px;
        display: grid;
        gap: 16px;
        align-content: start;
      }

      .detail-body--empty {
        place-content: center;
        text-align: center;
        color: var(--muted);
        font-size: 14px;
        padding: 48px 24px;
      }

      .detail-title {
        font-size: 22px;
        font-weight: 700;
        letter-spacing: -0.02em;
        color: var(--text);
        line-height: 1.3;
        word-break: keep-all;
      }

      .detail-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .detail-section {
        display: grid;
        gap: 8px;
        padding-top: 16px;
        border-top: 1px solid var(--line);
      }

      .detail-section-label {
        font-size: 12px;
        font-weight: 600;
        color: var(--muted);
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .detail-content {
        font-size: 15px;
        line-height: 1.7;
        color: var(--text);
        white-space: pre-wrap;
        word-break: break-word;
      }

      .detail-content.empty {
        color: var(--muted);
        font-style: italic;
      }

      /* Conflict banner */
      .detail-conflict {
        display: grid;
        gap: 8px;
        padding: 12px 14px;
        border: 1px solid #fca5a5;
        background: #fef2f2;
        border-radius: 6px;
        color: #991b1b;
        font-size: 13px;
      }

      .detail-conflict-title {
        font-weight: 700;
        letter-spacing: -0.01em;
      }

      .detail-conflict-list {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .detail-conflict-link {
        display: inline-flex;
        align-items: center;
        padding: 3px 10px;
        background: white;
        border: 1px solid #fca5a5;
        border-radius: 999px;
        color: #b91c1c;
        font-size: 12px;
        font-family: inherit;
        cursor: pointer;
        transition: background 0.15s;
      }

      .detail-conflict-link:hover {
        background: #fee2e2;
      }

      .semantic-conflict-warning {
        display: grid;
        gap: 8px;
        padding: 12px 14px;
        border: 1px solid #fcd34d;
        border-left: 4px solid #f59e0b;
        background: #fffbeb;
        border-radius: 6px;
        color: #92400e;
        font-size: 13px;
      }

      .semantic-conflict-warning-title {
        font-weight: 700;
        letter-spacing: -0.01em;
      }

      .semantic-conflict-item {
        display: grid;
        gap: 4px;
        padding: 8px 10px;
        background: white;
        border: 1px solid #fde68a;
        border-radius: 6px;
      }

      .semantic-conflict-item-header {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      .semantic-conflict-link {
        border: 0;
        background: transparent;
        color: #92400e;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
        padding: 0;
      }

      .semantic-conflict-link:hover {
        text-decoration: underline;
      }

      .semantic-conflict-confidence {
        display: inline-flex;
        padding: 2px 6px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
      }

      .semantic-conflict-confidence--high { background: #dc2626; color: white; }
      .semantic-conflict-confidence--medium { background: #f59e0b; color: #422006; }
      .semantic-conflict-confidence--low { background: #64748b; color: white; }

      /* Markdown body */
      .detail-markdown {
        font-size: 15px;
        line-height: 1.7;
        color: var(--text);
        word-break: break-word;
      }

      .detail-markdown h1,
      .detail-markdown h2,
      .detail-markdown h3,
      .detail-markdown h4 {
        font-weight: 700;
        letter-spacing: -0.02em;
        margin-top: 20px;
        margin-bottom: 10px;
        line-height: 1.3;
      }

      .detail-markdown h1 { font-size: 21px; }
      .detail-markdown h2 { font-size: 18px; }
      .detail-markdown h3 { font-size: 16px; }
      .detail-markdown h4 { font-size: 15px; }

      .detail-markdown > :first-child {
        margin-top: 0;
      }

      .detail-markdown p {
        margin: 0 0 10px;
      }

      .detail-markdown ul,
      .detail-markdown ol {
        margin: 0 0 10px;
        padding-left: 22px;
      }

      .detail-markdown li {
        margin-bottom: 4px;
      }

      .detail-markdown blockquote {
        margin: 10px 0;
        padding: 6px 14px;
        background: var(--accent-soft);
        border-left: 3px solid var(--accent);
        border-radius: 0 4px 4px 0;
      }

      .detail-markdown code {
        font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
        font-size: 0.9em;
        padding: 2px 5px;
        background: var(--tag-soft);
        border-radius: 3px;
      }

      .detail-markdown pre {
        font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
        font-size: 13px;
        padding: 12px 14px;
        margin: 0 0 10px;
        background: #0f172a;
        color: #e2e8f0;
        border-radius: 6px;
        overflow-x: auto;
      }

      .detail-markdown pre code {
        background: transparent;
        color: inherit;
        padding: 0;
        font-size: inherit;
      }

      .detail-markdown a {
        color: var(--accent);
        text-decoration: none;
      }

      .detail-markdown a:hover {
        text-decoration: underline;
      }

      .detail-markdown .wiki-link {
        color: var(--accent);
        background: var(--accent-soft);
        padding: 1px 6px;
        border-radius: 4px;
        font-weight: 500;
        cursor: pointer;
      }

      .detail-markdown .wiki-link:hover {
        background: var(--accent);
        color: white;
        text-decoration: none;
      }

      .detail-markdown .wiki-link--broken {
        color: #b91c1c;
        background: #fee2e2;
        text-decoration: line-through;
        cursor: not-allowed;
      }

      .detail-markdown .wiki-link--broken:hover {
        background: #fecaca;
        color: #991b1b;
        text-decoration: line-through;
      }

      .detail-markdown table {
        width: 100%;
        border-collapse: collapse;
        margin: 0 0 10px;
        font-size: 14px;
      }

      .detail-markdown th,
      .detail-markdown td {
        padding: 6px 10px;
        border: 1px solid var(--line);
        text-align: left;
      }

      .detail-markdown th {
        background: var(--bg);
        font-weight: 600;
      }

      /* Link list */
      .detail-link-list {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .detail-link-chip {
        display: inline-flex;
        align-items: center;
        padding: 4px 11px;
        border-radius: 999px;
        background: var(--accent-soft);
        color: var(--accent);
        font-size: 13px;
        font-family: inherit;
        cursor: pointer;
        border: 0;
        transition: background 0.15s, color 0.15s;
      }

      .detail-link-chip:hover {
        background: var(--accent);
        color: white;
      }

      .detail-link-chip--broken {
        background: #fee2e2;
        color: #b91c1c;
        text-decoration: line-through;
        cursor: not-allowed;
      }

      .detail-link-chip--broken:hover {
        background: #fecaca;
        color: #991b1b;
      }

      /* Sources */
      .detail-source-list {
        display: grid;
        gap: 8px;
      }

      .detail-source {
        display: grid;
        gap: 2px;
        padding: 10px 12px;
        border: 1px solid var(--line);
        border-radius: 6px;
        font-size: 13px;
      }

      .detail-source-title {
        font-weight: 600;
        color: var(--text);
      }

      .detail-source-url {
        color: var(--accent);
        word-break: break-all;
        font-size: 12px;
        text-decoration: none;
      }

      .detail-source-url:hover {
        text-decoration: underline;
      }

      .detail-source-meta {
        font-size: 11px;
        color: var(--muted);
      }

      /* Action buttons */
      .detail-actions {
        display: flex;
        gap: 8px;
        padding: 14px 20px;
        border-top: 1px solid var(--line);
        background: var(--panel);
        flex-shrink: 0;
      }

      .detail-button {
        border: 1px solid var(--line);
        background: var(--panel);
        color: var(--text);
        font: inherit;
        font-size: 14px;
        font-weight: 500;
        padding: 8px 16px;
        border-radius: 8px;
        cursor: pointer;
        transition: background 0.15s, border-color 0.15s, color 0.15s;
      }

      .detail-button:hover {
        background: var(--accent-soft);
        border-color: var(--accent);
        color: var(--accent);
      }

      .detail-button.primary {
        background: var(--accent);
        border-color: var(--accent);
        color: white;
      }

      .detail-button.primary:hover {
        opacity: 0.9;
        background: var(--accent);
        color: white;
      }

      .detail-button.danger {
        color: #b91c1c;
        border-color: rgba(185, 28, 28, 0.2);
      }

      .detail-button.danger:hover {
        background: rgba(185, 28, 28, 0.08);
        border-color: #b91c1c;
        color: #b91c1c;
      }

      .detail-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .detail-loading,
      .detail-not-found {
        padding: 48px 24px;
        text-align: center;
        color: var(--muted);
        font-size: 14px;
      }

      /* Edit-mode banner in Write tab */
      .edit-banner {
        display: none;
        align-items: center;
        gap: 8px;
        padding: 10px 14px;
        background: var(--accent-soft);
        border: 1px solid rgba(37, 99, 235, 0.2);
        border-radius: 8px;
        color: var(--accent);
        font-size: 13px;
        font-weight: 500;
      }

      .edit-banner.visible {
        display: flex;
      }

      .edit-banner-id {
        font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
        font-size: 12px;
        opacity: 0.8;
      }

      /* Form actions row */
      .form-actions {
        display: flex;
        gap: 8px;
        align-items: center;
      }

      .cancel-button {
        display: none;
        border: 1px solid var(--line);
        background: var(--panel);
        color: var(--muted);
        font: inherit;
        font-size: 14px;
        font-weight: 500;
        padding: 12px 20px;
        border-radius: 8px;
        cursor: pointer;
        transition: color 0.15s, border-color 0.15s;
      }

      .cancel-button.visible {
        display: inline-flex;
      }

      .cancel-button:hover {
        color: var(--text);
        border-color: var(--text);
      }

      /* Index item — make clickable */
      .index-item {
        cursor: pointer;
      }

      /* Toast notifications */
      .toast-container {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 300;
        display: flex;
        flex-direction: column;
        gap: 8px;
        pointer-events: none;
      }

      .toast {
        padding: 12px 16px;
        border-radius: 8px;
        background: var(--panel);
        border: 1px solid var(--line);
        box-shadow: 0 4px 12px rgba(15, 23, 42, 0.12);
        font-size: 14px;
        color: var(--text);
        min-width: 240px;
        max-width: 360px;
        pointer-events: auto;
        animation: toast-in 0.2s ease-out;
      }

      .toast.success {
        border-left: 4px solid #15803d;
      }

      .toast.error {
        border-left: 4px solid #b91c1c;
      }

      @keyframes toast-in {
        from { transform: translateY(8px); opacity: 0; }
        to   { transform: translateY(0);   opacity: 1; }
      }

      /* Ask AI tab */
      .ask-section {
        display: grid;
        gap: 20px;
        max-width: 760px;
        margin: 0 auto;
      }

      .ask-input-card {
        display: grid;
        gap: 10px;
        padding: 18px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--panel);
      }

      .ask-label {
        font-size: 13px;
        font-weight: 600;
        color: var(--muted);
        letter-spacing: 0.02em;
      }

      .ask-textarea {
        width: 100%;
        min-height: 88px;
        resize: vertical;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--panel);
        color: var(--text);
        font: inherit;
        font-size: 15px;
        line-height: 1.6;
        padding: 12px 14px;
        transition: border-color 0.2s, box-shadow 0.2s;
      }

      .ask-textarea:focus {
        outline: none;
        border-color: var(--accent);
        box-shadow: 0 0 0 3px var(--accent-soft);
      }

      .ask-textarea::placeholder {
        color: var(--muted);
        opacity: 0.6;
      }

      .ask-input-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
      }

      .ask-hint {
        font-size: 12px;
        color: var(--muted);
      }

      .ask-submit-button {
        border: 0;
        border-radius: 8px;
        padding: 10px 22px;
        background: var(--accent);
        color: white;
        font: inherit;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: opacity 0.2s, background 0.2s;
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }

      .ask-submit-button:hover:not(:disabled) {
        opacity: 0.9;
      }

      .ask-submit-button:disabled {
        cursor: not-allowed;
        opacity: 0.5;
      }

      .ask-result-area {
        min-height: 80px;
      }

      .ask-loading {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 24px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--panel);
        color: var(--muted);
        font-size: 14px;
      }

      .ask-error {
        padding: 16px 18px;
        border: 1px solid #fca5a5;
        background: #fef2f2;
        border-radius: 8px;
        color: #991b1b;
        font-size: 14px;
        line-height: 1.6;
      }

      .ask-answer-card {
        display: grid;
        gap: 16px;
        padding: 22px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--panel);
      }

      .ask-question-echo {
        font-size: 13px;
        color: var(--muted);
        padding: 10px 14px;
        background: var(--bg);
        border-radius: 6px;
        border-left: 3px solid var(--accent);
        word-break: break-word;
        white-space: pre-wrap;
        line-height: 1.55;
      }

      .ask-question-echo-label {
        display: block;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--muted);
        margin-bottom: 4px;
      }

      .ask-answer-section {
        display: grid;
        gap: 8px;
      }

      .ask-section-label {
        font-size: 12px;
        font-weight: 600;
        color: var(--muted);
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .ask-answer-body {
        font-size: 15px;
        line-height: 1.7;
        color: var(--text);
        word-break: break-word;
      }

      .ask-answer-body h1,
      .ask-answer-body h2,
      .ask-answer-body h3,
      .ask-answer-body h4 {
        font-weight: 700;
        letter-spacing: -0.02em;
        margin-top: 18px;
        margin-bottom: 10px;
        line-height: 1.3;
      }

      .ask-answer-body h1 { font-size: 21px; }
      .ask-answer-body h2 { font-size: 18px; }
      .ask-answer-body h3 { font-size: 16px; }
      .ask-answer-body h4 { font-size: 15px; }

      .ask-answer-body > :first-child {
        margin-top: 0;
      }

      .ask-answer-body p {
        margin: 0 0 10px;
      }

      .ask-answer-body ul,
      .ask-answer-body ol {
        margin: 0 0 10px;
        padding-left: 22px;
      }

      .ask-answer-body li {
        margin-bottom: 4px;
      }

      .ask-answer-body blockquote {
        margin: 10px 0;
        padding: 6px 14px;
        background: var(--accent-soft);
        border-left: 3px solid var(--accent);
        border-radius: 0 4px 4px 0;
      }

      .ask-answer-body code {
        font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
        font-size: 0.9em;
        padding: 2px 5px;
        background: var(--tag-soft);
        border-radius: 3px;
      }

      .ask-answer-body pre {
        font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
        font-size: 13px;
        padding: 12px 14px;
        margin: 0 0 10px;
        background: #0f172a;
        color: #e2e8f0;
        border-radius: 6px;
        overflow-x: auto;
      }

      .ask-answer-body pre code {
        background: transparent;
        color: inherit;
        padding: 0;
        font-size: inherit;
      }

      .ask-answer-body a {
        color: var(--accent);
        text-decoration: none;
      }

      .ask-answer-body a:hover {
        text-decoration: underline;
      }

      .ask-answer-body table {
        width: 100%;
        border-collapse: collapse;
        margin: 0 0 10px;
        font-size: 14px;
      }

      .ask-answer-body th,
      .ask-answer-body td {
        padding: 6px 10px;
        border: 1px solid var(--line);
        text-align: left;
      }

      .ask-answer-body th {
        background: var(--bg);
        font-weight: 600;
      }

      .ask-sources-list {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .ask-source-chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 5px 12px;
        border-radius: 999px;
        background: var(--accent-soft);
        color: var(--accent);
        font-size: 13px;
        font-weight: 500;
        font-family: inherit;
        cursor: pointer;
        border: 1px solid transparent;
        transition: background 0.15s, color 0.15s, border-color 0.15s;
      }

      .ask-source-chip:hover {
        background: var(--accent);
        color: white;
        border-color: var(--accent);
      }

      .ask-source-chip:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
      }

      .ask-source-chip-icon {
        font-size: 11px;
        opacity: 0.7;
      }

      .ask-source-chip:hover .ask-source-chip-icon {
        opacity: 1;
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

        .filter-bar {
          padding: 12px;
        }

        .filter-actions {
          flex-direction: column-reverse;
          align-items: stretch;
          gap: 10px;
        }

        .clear-button {
          width: 100%;
        }

        .browse-layout {
          grid-template-columns: 1fr;
        }

        .detail-backdrop {
          display: block;
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.4);
          z-index: 200;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.2s;
        }

        .detail-backdrop.open {
          opacity: 1;
          pointer-events: auto;
        }

        .detail-panel {
          position: fixed;
          top: 0;
          right: 0;
          bottom: 0;
          left: 0;
          max-height: 100vh;
          min-height: 0;
          border: 0;
          border-radius: 0;
          z-index: 201;
          box-shadow: -8px 0 24px rgba(15, 23, 42, 0.12);
          transform: translateX(100%);
          transition: transform 0.25s ease-out;
        }

        .detail-panel.open {
          transform: translateX(0);
        }

        .detail-panel[aria-hidden="true"] {
          pointer-events: none;
        }

        .detail-panel[aria-hidden="true"] .detail-body--empty {
          display: none;
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
      <button class="tab-button" data-tab="ask-ai">Ask AI</button>
    </nav>

    <main class="container">
      <!-- Write Tab -->
      <section id="write-tab" class="tab-content active">
        <form id="write-form" class="write-section">
          <div id="edit-banner" class="edit-banner">
            <span>편집 중:</span>
            <span id="edit-banner-id" class="edit-banner-id"></span>
          </div>

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
            <label for="parent-select">부모 문서 (선택)</label>
            <select id="parent-select" name="parentSlug">
              <option value="">— 최상위 문서 —</option>
            </select>
          </div>

          <div class="input-group">
            <label for="content-input">내용</label>
            <textarea id="content-input" name="content"></textarea>
          </div>

          <div class="form-actions">
            <button id="save-button" class="save-button" type="submit">
              저장하기
            </button>
            <button id="cancel-button" class="cancel-button" type="button">
              취소
            </button>
          </div>
        </form>
      </section>

      <!-- Browse Tab -->
      <section id="browse-tab" class="tab-content">
        <div class="browse-layout">
          <div class="browse-list-pane">
            <div class="browse-section">
              <div class="search-bar">
                <span class="search-icon" aria-hidden="true">🔍</span>
                <input
                  id="search-input"
                  type="search"
                  class="search-input"
                  placeholder="제목 또는 내용 검색…"
                  autocomplete="off"
                />
              </div>

              <div id="filter-bar" class="filter-bar">
                <div class="filter-group">
                  <span class="filter-label">상태</span>
                  <div id="status-chips" class="chip-row">
                    <button type="button" class="chip chip--status-draft" data-status="draft">draft</button>
                    <button type="button" class="chip chip--status-review" data-status="review">review</button>
                    <button type="button" class="chip chip--status-published" data-status="published">published</button>
                  </div>
                </div>

                <div class="filter-group">
                  <span class="filter-label">도메인</span>
                  <div id="domain-chips" class="chip-row">
                    <span class="chip-empty">도메인 없음</span>
                  </div>
                </div>

                <div class="filter-group">
                  <span class="filter-label">태그</span>
                  <div id="tag-chips" class="chip-row">
                    <span class="chip-empty">태그 없음</span>
                  </div>
                </div>

                <div class="filter-actions">
                  <div id="results-count" class="results-count">전체 <strong>0</strong>개 문서</div>
                  <button id="clear-filters" type="button" class="clear-button" disabled>필터 초기화</button>
                </div>
              </div>

              <div id="index-list" class="index-list">
                <div class="empty-state">아직 문서가 없습니다</div>
              </div>
            </div>
          </div>

          <aside id="detail-panel" class="detail-panel" aria-hidden="true">
            <header class="detail-header">
              <span class="detail-header-label">문서 상세</span>
              <button id="detail-close" type="button" class="detail-close" aria-label="닫기">×</button>
            </header>
            <div id="detail-body" class="detail-body">
              <div class="detail-body--empty">목록에서 문서를 선택하세요</div>
            </div>
            <div id="detail-actions" class="detail-actions" hidden>
              <button id="detail-edit-button" type="button" class="detail-button primary">편집</button>
              <button id="detail-delete-button" type="button" class="detail-button danger">삭제</button>
            </div>
          </aside>
        </div>
      </section>

      <!-- Ask AI Tab -->
      <section id="ask-ai-tab" class="tab-content">
        <div class="ask-section">
          <div class="ask-input-card">
            <label for="ask-question-input" class="ask-label">질문</label>
            <textarea
              id="ask-question-input"
              class="ask-textarea"
              rows="3"
              placeholder="궁금한 내용을 입력하세요... (Enter: 제출, Shift+Enter: 줄바꿈)"
            ></textarea>
            <div class="ask-input-actions">
              <span id="ask-hint" class="ask-hint">Enter로 제출 · Shift+Enter로 줄바꿈</span>
              <button
                id="ask-submit-button"
                class="ask-submit-button"
                type="button"
                disabled
              >
                질문하기
              </button>
            </div>
          </div>

          <div id="ask-result-area" class="ask-result-area">
            <div class="empty-state">위키에 무엇이든 물어보세요</div>
          </div>
        </div>
      </section>
    </main>

    <div id="detail-backdrop" class="detail-backdrop" hidden></div>

    <div id="toast-container" class="toast-container" aria-live="polite"></div>

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
      const parentSelect = document.getElementById('parent-select');
      const saveButton = document.getElementById('save-button');
      const indexList = document.getElementById('index-list');

      // Browse / search elements
      const searchInput = document.getElementById('search-input');
      const statusChipsRoot = document.getElementById('status-chips');
      const domainChipsRoot = document.getElementById('domain-chips');
      const tagChipsRoot = document.getElementById('tag-chips');
      const resultsCount = document.getElementById('results-count');
      const clearFiltersButton = document.getElementById('clear-filters');

      // Filter state
      const filters = {
        query: '',
        status: null,   // string | null
        domain: null,   // string | null
        tags: new Set(),
      };

      // Tree state — collapsed by default, expand on demand
      const treeState = {
        expanded: new Set(),
      };

      const toggleNode = (id) => {
        if (treeState.expanded.has(id)) {
          treeState.expanded.delete(id);
        } else {
          treeState.expanded.add(id);
        }
        renderCurrentEntries();
      };

      // Render functions
      const escapeHtml = (value) => {
        if (value === null || value === undefined) return '';
        return String(value)
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')
          .replaceAll('"', '&quot;')
          .replaceAll("'", '&#39;');
      };

      const renderBadges = (entry) => {
        const parts = [];
        const status = entry.status || 'draft';
        parts.push(
          '<span class="badge badge--status-' + escapeHtml(status) + '">' + escapeHtml(status) + '</span>'
        );
        if (entry.domain) {
          parts.push('<span class="badge badge--domain">' + escapeHtml(entry.domain) + '</span>');
        }
        if (Array.isArray(entry.tags)) {
          entry.tags.forEach(tag => {
            parts.push('<span class="badge badge--tag">' + escapeHtml(tag) + '</span>');
          });
        }
        return parts.join('');
      };

      const buildTree = (entries) => {
        const byId = new Map(entries.map(e => [e.id, e]));
        const childrenMap = new Map();
        const roots = [];

        entries.forEach(entry => {
          const parent = entry.parentSlug;
          if (!parent || !byId.has(parent)) {
            roots.push(entry);
          } else {
            if (!childrenMap.has(parent)) {
              childrenMap.set(parent, []);
            }
            childrenMap.get(parent).push(entry);
          }
        });

        const sortAlpha = (a, b) => (a.title || '').localeCompare(b.title || '');
        roots.sort(sortAlpha);
        childrenMap.forEach(list => list.sort(sortAlpha));

        return { roots, childrenMap };
      };

      const renderIndex = (entries) => {
        if (!entries.length) {
          indexList.innerHTML = '<div class="empty-state">검색 결과가 없습니다</div>';
          return;
        }

        const { roots, childrenMap } = buildTree(entries);

        const renderNode = (entry, level) => {
          const hasChildren = childrenMap.has(entry.id);
          const isExpanded = treeState.expanded.has(entry.id);
          const toggleSymbol = hasChildren
            ? (isExpanded ? '▼' : '▶')
            : '·';
          const toggleClass = hasChildren
            ? 'index-item-toggle'
            : 'index-item-toggle index-item-toggle--leaf';
          const toggleAttr = hasChildren
            ? ' data-toggle-id="' + escapeHtml(entry.id) + '"'
            : '';

          const cappedLevel = Math.min(level, 6);

          let html =
            '<article class="index-item index-item--level-' + cappedLevel + '" data-id="' + escapeHtml(entry.id) + '">' +
              '<div class="index-item-header">' +
                '<span class="' + toggleClass + '"' + toggleAttr + '>' + toggleSymbol + '</span>' +
                '<div class="index-item-title">' + escapeHtml(entry.title) + '</div>' +
              '</div>' +
              (entry.summary ? '<div class="index-item-summary">' + escapeHtml(entry.summary) + '</div>' : '') +
              '<div class="index-item-meta">' + renderBadges(entry) + '</div>' +
            '</article>';

          if (hasChildren && isExpanded) {
            childrenMap.get(entry.id).forEach(child => {
              html += renderNode(child, level + 1);
            });
          }

          return html;
        };

        indexList.innerHTML = roots.map(root => renderNode(root, 1)).join('');
      };

      let lastEntries = [];
      const renderCurrentEntries = () => renderIndex(lastEntries);

      const populateParentSelect = (entries) => {
        const currentValue = parentSelect.value;
        const currentSlug = editingDocumentId;
        const sorted = [...entries].sort((a, b) =>
          (a.title || '').localeCompare(b.title || ''),
        );
        const options = ['<option value="">— 최상위 문서 —</option>'];
        sorted.forEach(entry => {
          if (currentSlug && entry.id === currentSlug) return;
          options.push(
            '<option value="' + escapeHtml(entry.id) + '">' +
              escapeHtml(entry.title) +
            '</option>',
          );
        });
        parentSelect.innerHTML = options.join('');
        if (currentValue && parentSelect.querySelector('option[value="' + currentValue.replace(/"/g, '\\"') + '"]')) {
          parentSelect.value = currentValue;
        }
      };

      // Filter bar rendering
      const renderStatusChips = () => {
        Array.from(statusChipsRoot.querySelectorAll('.chip')).forEach(chip => {
          const value = chip.dataset.status;
          chip.classList.toggle('active', filters.status === value);
        });
      };

      const renderDomainChips = (domains) => {
        if (!domains.length) {
          domainChipsRoot.innerHTML = '<span class="chip-empty">도메인 없음</span>';
          return;
        }
        domainChipsRoot.innerHTML = domains.map(domain => {
          const isActive = filters.domain === domain;
          return '<button type="button" class="chip' + (isActive ? ' active' : '') +
            '" data-domain="' + escapeHtml(domain) + '">' + escapeHtml(domain) + '</button>';
        }).join('');
      };

      const renderTagChips = (tags) => {
        if (!tags.length) {
          tagChipsRoot.innerHTML = '<span class="chip-empty">태그 없음</span>';
          return;
        }
        tagChipsRoot.innerHTML = tags.map(tag => {
          const isActive = filters.tags.has(tag);
          return '<button type="button" class="chip' + (isActive ? ' active' : '') +
            '" data-tag="' + escapeHtml(tag) + '">' + escapeHtml(tag) + '</button>';
        }).join('');
      };

      const updateClearButton = () => {
        const hasFilters =
          filters.query.length > 0 ||
          filters.status !== null ||
          filters.domain !== null ||
          filters.tags.size > 0;
        clearFiltersButton.disabled = !hasFilters;
      };

      const updateResultsCount = (entries) => {
        const total = entries.length;
        const hasFilters = !clearFiltersButton.disabled;
        const prefix = hasFilters ? '검색결과' : '전체';
        resultsCount.innerHTML = prefix + ' <strong>' + total + '</strong>개 문서';
      };

      // Filter option cache (collected on first load, kept stable across filtering)
      let availableDomains = [];
      let availableTags = [];

      const collectFilterOptions = (entries) => {
        const domainSet = new Set();
        const tagSet = new Set();
        entries.forEach(entry => {
          if (entry.domain) domainSet.add(entry.domain);
          if (Array.isArray(entry.tags)) {
            entry.tags.forEach(tag => tagSet.add(tag));
          }
        });
        availableDomains = Array.from(domainSet).sort();
        availableTags = Array.from(tagSet).sort();
        renderDomainChips(availableDomains);
        renderTagChips(availableTags);
      };

      // API
      const buildSearchUrl = () => {
        const params = new URLSearchParams();
        if (filters.query) params.set('query', filters.query);
        if (filters.status) params.set('status', filters.status);
        if (filters.domain) params.set('domain', filters.domain);
        if (filters.tags.size > 0) params.set('tags', Array.from(filters.tags).join(','));
        const qs = params.toString();
        return '/documents/search' + (qs ? '?' + qs : '');
      };

      let isLoading = false;
      let pendingRequest = 0;

      const showLoading = () => {
        indexList.innerHTML =
          '<div class="loading-state">' +
            '<span class="loading-spinner"></span>' +
            '검색 중…' +
          '</div>';
      };

      const performSearch = async () => {
        const requestId = ++pendingRequest;
        if (isLoading === false) {
          showLoading();
        }
        isLoading = true;
        try {
          const response = await fetch(buildSearchUrl());
          if (!response.ok) {
            throw new Error('search failed: ' + response.status);
          }
          const entries = await response.json();
          if (requestId !== pendingRequest) return; // stale response
          lastEntries = entries;
          updateClearButton();
          updateResultsCount(entries);
          renderStatusChips();
          renderDomainChips(availableDomains);
          renderTagChips(availableTags);
          renderIndex(entries);
          populateParentSelect(entries);
        } catch (error) {
          if (requestId !== pendingRequest) return;
          console.error('Search failed:', error);
          indexList.innerHTML = '<div class="empty-state">검색에 실패했습니다. 잠시 후 다시 시도해 주세요.</div>';
        } finally {
          if (requestId === pendingRequest) {
            isLoading = false;
          }
        }
      };

      // Initial load: fetch all and seed filter options from full result set
      const initialLoad = async () => {
        showLoading();
        try {
          const response = await fetch('/documents/search');
          if (!response.ok) throw new Error('initial load failed');
          const entries = await response.json();
          lastEntries = entries;
          collectFilterOptions(entries);
          updateClearButton();
          updateResultsCount(entries);
          renderStatusChips();
          renderIndex(entries);
          populateParentSelect(entries);
        } catch (error) {
          console.error('Initial load failed:', error);
          indexList.innerHTML = '<div class="empty-state">목록을 불러오지 못했습니다.</div>';
        }
      };

      // Debounced search input
      let searchTimer = null;
      searchInput.addEventListener('input', () => {
        filters.query = searchInput.value.trim();
        if (searchTimer) clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
          performSearch();
        }, 500);
      });

      // Status chip toggles
      statusChipsRoot.addEventListener('click', (event) => {
        const target = event.target.closest('.chip');
        if (!target) return;
        const value = target.dataset.status;
        filters.status = filters.status === value ? null : value;
        performSearch();
      });

      // Domain chip toggles (event delegation; chips are dynamic)
      domainChipsRoot.addEventListener('click', (event) => {
        const target = event.target.closest('.chip');
        if (!target) return;
        const value = target.dataset.domain;
        filters.domain = filters.domain === value ? null : value;
        performSearch();
      });

      // Tag chip multi-select (event delegation)
      tagChipsRoot.addEventListener('click', (event) => {
        const target = event.target.closest('.chip');
        if (!target) return;
        const value = target.dataset.tag;
        if (filters.tags.has(value)) {
          filters.tags.delete(value);
        } else {
          filters.tags.add(value);
        }
        performSearch();
      });

      // Clear filters
      clearFiltersButton.addEventListener('click', () => {
        filters.query = '';
        filters.status = null;
        filters.domain = null;
        filters.tags.clear();
        searchInput.value = '';
        if (searchTimer) clearTimeout(searchTimer);
        performSearch();
      });

      // Form submission
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        saveButton.disabled = true;
        const isEditing = editingDocumentId !== null;
        saveButton.textContent = isEditing ? '수정 중...' : '저장 중...';

        try {
          const url = isEditing ? '/documents/' + encodeURIComponent(editingDocumentId) : '/documents';
          const method = isEditing ? 'PUT' : 'POST';
          const parentValue = parentSelect.value || null;
          const response = await fetch(url, {
            method,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              title: titleInput.value,
              content: easyMDE.value(),
              parentSlug: parentValue,
            }),
          });

          const payload = await response.json();

          if (!response.ok) {
            const message = payload.message || (isEditing ? '수정에 실패했습니다.' : '저장에 실패했습니다.');
            showToast(message, 'error');
            return;
          }

          if (isEditing) {
            showToast('문서가 수정되었습니다.', 'success');
          } else {
            showToast('문서가 저장되었습니다.', 'success');
          }

          await initialLoad();

          exitEditMode();
          titleInput.value = '';
          easyMDE.value('');

          if (isEditing) {
            switchToTab('browse');
          }
        } catch (error) {
          const message = '네트워크 오류가 발생했습니다.';
          showToast(message, 'error');
        } finally {
          saveButton.disabled = false;
          saveButton.textContent = editingDocumentId !== null ? '수정' : '저장하기';
        }
      });

      let editingDocumentId = null;
      const editBanner = document.getElementById('edit-banner');
      const editBannerId = document.getElementById('edit-banner-id');
      const cancelButton = document.getElementById('cancel-button');

      const enterEditMode = (document_) => {
        editingDocumentId = document_.id;
        titleInput.value = document_.title;
        easyMDE.value(document_.content || '');
        populateParentSelect(lastEntries);
        parentSelect.value = document_.parentSlug || '';
        saveButton.textContent = '수정';
        cancelButton.classList.add('visible');
        editBanner.classList.add('visible');
        editBannerId.textContent = document_.id;
      };

      const exitEditMode = () => {
        editingDocumentId = null;
        parentSelect.value = '';
        populateParentSelect(lastEntries);
        saveButton.textContent = '저장하기';
        cancelButton.classList.remove('visible');
        editBanner.classList.remove('visible');
        editBannerId.textContent = '';
      };

      cancelButton.addEventListener('click', () => {
        exitEditMode();
        titleInput.value = '';
        easyMDE.value('');
        switchToTab('browse');
      });

      const switchToTab = (name) => {
        const targetButton = document.querySelector('[data-tab="' + name + '"]');
        if (targetButton) targetButton.click();
      };

      const detailPanel = document.getElementById('detail-panel');
      const detailBackdrop = document.getElementById('detail-backdrop');
      const detailBody = document.getElementById('detail-body');
      const detailActions = document.getElementById('detail-actions');
      const detailCloseButton = document.getElementById('detail-close');
      const detailEditButton = document.getElementById('detail-edit-button');
      const detailDeleteButton = document.getElementById('detail-delete-button');

      let currentDetailDocument = null;

      const openDetailPanel = () => {
        detailPanel.classList.add('open');
        detailBackdrop.classList.add('open');
        detailBackdrop.hidden = false;
        detailPanel.setAttribute('aria-hidden', 'false');
      };

      const renderDetailEmpty = () => {
        detailBody.innerHTML = '<div class="detail-body--empty">목록에서 문서를 선택하세요</div>';
      };

      const closeDetailPanel = () => {
        detailPanel.classList.remove('open');
        detailBackdrop.classList.remove('open');
        detailPanel.setAttribute('aria-hidden', 'true');
        currentDetailDocument = null;
        detailActions.hidden = true;
        renderDetailEmpty();
        setTimeout(() => {
          if (!detailPanel.classList.contains('open')) {
            detailBackdrop.hidden = true;
          }
        }, 250);
      };

      const WIKI_LINK_PATTERN = /\\[\\[([^\\]\\n]+)\\]\\]/g;
      const WIKI_LINK_PLACEHOLDER_PATTERN = /@@WIKI_LINK::([^@]+)@@/g;

      const transformWikiLinks = (markdown) => {
        return markdown.replace(WIKI_LINK_PATTERN, (_match, slug) => {
          return '@@WIKI_LINK::' + slug.trim() + '@@';
        });
      };

      const replaceWikiLinkPlaceholders = (html, brokenLinks) => {
        const brokenSet = new Set(brokenLinks || []);
        return html.replace(WIKI_LINK_PLACEHOLDER_PATTERN, (_match, slug) => {
          const trimmed = slug.trim();
          const isBroken = brokenSet.has(trimmed);
          const cls = isBroken ? 'wiki-link wiki-link--broken' : 'wiki-link';
          const title = isBroken ? '깨진 링크' : '문서로 이동';
          return '<a class="' + cls + '" data-detail-link="' + escapeHtml(trimmed) + '" title="' + title + '">' + escapeHtml(trimmed) + '</a>';
        });
      };

      const renderConflictBanner = (doc) => {
        if (!doc.conflict) return '';
        const conflictWith = Array.isArray(doc.conflictWith) ? doc.conflictWith : [];
        const links = conflictWith.length > 0
          ? '<div class="detail-conflict-list">' +
              conflictWith.map(slug =>
                '<button type="button" class="detail-conflict-link" data-detail-link="' +
                escapeHtml(slug) + '">' + escapeHtml(slug) + '</button>'
              ).join('') +
            '</div>'
          : '';
        return '<div class="detail-conflict">' +
                 '<div class="detail-conflict-title">⚠️ 충돌 감지</div>' +
                 '<div>다음 문서와 내용이 겹치거나 모순될 수 있습니다.</div>' +
                 links +
               '</div>';
      };

      const renderSemanticConflictBanner = (doc) => {
        const conflicts = Array.isArray(doc.semanticConflicts) ? doc.semanticConflicts : [];
        if (conflicts.length === 0) return '';

        return '<div class="semantic-conflict-warning">' +
                 '<div class="semantic-conflict-warning-title">⚠️ 의미론적 충돌 감지</div>' +
                 conflicts.map(conflict => {
                   const confidence = conflict.confidence || 'low';
                   const slug = conflict.conflictingDocumentSlug || '';
                   const title = conflict.conflictingDocumentTitle || slug;
                   return '<div class="semantic-conflict-item">' +
                            '<div class="semantic-conflict-item-header">' +
                              '<button type="button" class="semantic-conflict-link" data-detail-link="' + escapeHtml(slug) + '">' +
                                escapeHtml(title) +
                              '</button>' +
                              '<span class="semantic-conflict-confidence semantic-conflict-confidence--' + escapeHtml(confidence) + '">' +
                                escapeHtml(confidence) +
                              '</span>' +
                            '</div>' +
                            '<div>' + escapeHtml(conflict.explanation || '') + '</div>' +
                          '</div>';
                 }).join('') +
               '</div>';
      };

      const renderMarkdownContent = (content, brokenLinks) => {
        if (!content || content.trim().length === 0) {
          return '<div class="detail-content empty">내용이 없습니다.</div>';
        }
        const transformed = transformWikiLinks(content);
        const rawHtml = window.marked && typeof window.marked.parse === 'function'
          ? window.marked.parse(transformed, { gfm: true, breaks: false })
          : escapeHtml(transformed);
        const withLinks = replaceWikiLinkPlaceholders(rawHtml, brokenLinks);
        const safe = window.DOMPurify
          ? window.DOMPurify.sanitize(withLinks, { ADD_ATTR: ['data-detail-link', 'title'] })
          : withLinks;
        return '<div class="detail-markdown">' + safe + '</div>';
      };

      const renderLinkSections = (doc) => {
        const links = doc.links || {};
        const outbound = Array.isArray(links.outbound) ? links.outbound : [];
        const broken = Array.isArray(links.broken) ? links.broken : [];
        if (outbound.length === 0 && broken.length === 0) return '';

        const parts = [];
        if (outbound.length > 0) {
          parts.push(
            '<div class="detail-section">' +
              '<span class="detail-section-label">아웃바운드 링크</span>' +
              '<div class="detail-link-list">' +
                outbound.map(slug =>
                  '<button type="button" class="detail-link-chip" data-detail-link="' +
                  escapeHtml(slug) + '">' + escapeHtml(slug) + '</button>'
                ).join('') +
              '</div>' +
            '</div>'
          );
        }
        if (broken.length > 0) {
          parts.push(
            '<div class="detail-section">' +
              '<span class="detail-section-label">깨진 링크</span>' +
              '<div class="detail-link-list">' +
                broken.map(slug =>
                  '<span class="detail-link-chip detail-link-chip--broken">' +
                  escapeHtml(slug) + '</span>'
                ).join('') +
              '</div>' +
            '</div>'
          );
        }
        return parts.join('');
      };

      const renderSources = (doc) => {
        const sources = Array.isArray(doc.sources) ? doc.sources : [];
        if (sources.length === 0) return '';
        return '<div class="detail-section">' +
                 '<span class="detail-section-label">출처</span>' +
                 '<div class="detail-source-list">' +
                   sources.map(src => {
                     const title = src.title || src.pageId || '';
                     const url = src.url || '';
                     const lastSynced = src.lastSynced || '';
                     return '<div class="detail-source">' +
                              (title ? '<div class="detail-source-title">' + escapeHtml(title) + '</div>' : '') +
                              (url ? '<a class="detail-source-url" href="' + escapeHtml(url) + '" target="_blank" rel="noopener">' + escapeHtml(url) + '</a>' : '') +
                              (lastSynced ? '<div class="detail-source-meta">동기화: ' + escapeHtml(lastSynced) + '</div>' : '') +
                            '</div>';
                   }).join('') +
                 '</div>' +
               '</div>';
      };

      const renderDetail = (doc) => {
        const tags = Array.isArray(doc.tags) ? doc.tags : [];
        const status = doc.status || 'draft';
        const badges = [];
        badges.push(
          '<span class="badge badge--status-' + escapeHtml(status) + '">' + escapeHtml(status) + '</span>'
        );
        if (doc.domain) {
          badges.push('<span class="badge badge--domain">' + escapeHtml(doc.domain) + '</span>');
        }
        tags.forEach(tag => {
          badges.push('<span class="badge badge--tag">' + escapeHtml(tag) + '</span>');
        });

        detailBody.innerHTML =
          renderConflictBanner(doc) +
          renderSemanticConflictBanner(doc) +
          '<div class="detail-title">' + escapeHtml(doc.title) + '</div>' +
          '<div class="detail-meta">' + badges.join('') + '</div>' +
          renderMarkdownContent(doc.content, (doc.links && doc.links.broken) || []) +
          renderLinkSections(doc) +
          renderSources(doc);

        detailActions.hidden = false;
      };

      const showDetailLoading = () => {
        detailBody.innerHTML = '<div class="detail-loading"><span class="loading-spinner"></span>불러오는 중…</div>';
        detailActions.hidden = true;
      };

      const showDetailNotFound = () => {
        detailBody.innerHTML = '<div class="detail-not-found">문서를 찾을 수 없습니다.</div>';
        detailActions.hidden = true;
      };

      const showDetailError = (message) => {
        detailBody.innerHTML = '<div class="detail-not-found">' + escapeHtml(message) + '</div>';
        detailActions.hidden = true;
      };

      const fetchAndShowDetail = async (id) => {
        openDetailPanel();
        showDetailLoading();
        try {
          const response = await fetch('/documents/' + encodeURIComponent(id));
          if (response.status === 404) {
            showDetailNotFound();
            return;
          }
          if (!response.ok) {
            showDetailError('불러오는 데 실패했습니다. 잠시 후 다시 시도해 주세요.');
            return;
          }
          const doc = await response.json();
          currentDetailDocument = doc;
          renderDetail(doc);
        } catch (error) {
          console.error('Detail load failed:', error);
          showDetailError('네트워크 오류가 발생했습니다.');
        }
      };

      indexList.addEventListener('click', (event) => {
        const toggle = event.target.closest('.index-item-toggle');
        if (toggle && !toggle.classList.contains('index-item-toggle--leaf')) {
          event.stopPropagation();
          const id = toggle.dataset.toggleId;
          if (id) toggleNode(id);
          return;
        }
        const item = event.target.closest('.index-item');
        if (!item) return;
        const id = item.dataset.id;
        if (!id) return;
        fetchAndShowDetail(id);
      });

      detailBody.addEventListener('click', (event) => {
        const linkEl = event.target.closest('[data-detail-link]');
        if (!linkEl) return;
        if (linkEl.classList.contains('wiki-link--broken')) {
          event.preventDefault();
          return;
        }
        const slug = linkEl.dataset.detailLink;
        if (!slug) return;
        event.preventDefault();
        fetchAndShowDetail(slug);
      });

      detailCloseButton.addEventListener('click', closeDetailPanel);
      detailBackdrop.addEventListener('click', closeDetailPanel);
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && detailPanel.classList.contains('open')) {
          closeDetailPanel();
        }
      });

      detailEditButton.addEventListener('click', () => {
        if (!currentDetailDocument) return;
        enterEditMode(currentDetailDocument);
        closeDetailPanel();
        switchToTab('write');
      });

      detailDeleteButton.addEventListener('click', async () => {
        if (!currentDetailDocument) return;
        const confirmed = window.confirm('정말 삭제하시겠습니까?');
        if (!confirmed) return;

        const id = currentDetailDocument.id;
        detailDeleteButton.disabled = true;
        detailEditButton.disabled = true;

        try {
          const response = await fetch('/documents/' + encodeURIComponent(id), {
            method: 'DELETE',
          });
          if (!response.ok && response.status !== 204) {
            showToast('삭제에 실패했습니다.', 'error');
            return;
          }
          showToast('문서가 삭제되었습니다.', 'success');
          closeDetailPanel();
          await initialLoad();

          if (editingDocumentId === id) {
            exitEditMode();
            titleInput.value = '';
            easyMDE.value('');
          }
        } catch (error) {
          console.error('Delete failed:', error);
          showToast('네트워크 오류가 발생했습니다.', 'error');
        } finally {
          detailDeleteButton.disabled = false;
          detailEditButton.disabled = false;
        }
      });

      const toastContainer = document.getElementById('toast-container');
      const showToast = (message, kind) => {
        const toast = document.createElement('div');
        toast.className = 'toast ' + (kind === 'error' ? 'error' : 'success');
        toast.textContent = message;
        toastContainer.appendChild(toast);
        setTimeout(() => {
          toast.style.transition = 'opacity 0.2s';
          toast.style.opacity = '0';
          setTimeout(() => toast.remove(), 220);
        }, 2400);
      };

      // Ask AI tab
      const askQuestionInput = document.getElementById('ask-question-input');
      const askSubmitButton = document.getElementById('ask-submit-button');
      const askResultArea = document.getElementById('ask-result-area');

      let askInFlight = false;

      const updateAskSubmitState = () => {
        const hasText = askQuestionInput.value.trim().length > 0;
        askSubmitButton.disabled = !hasText || askInFlight;
      };

      const renderAskEmpty = () => {
        askResultArea.innerHTML = '<div class="empty-state">위키에 무엇이든 물어보세요</div>';
      };

      const renderAskLoading = () => {
        askResultArea.innerHTML =
          '<div class="ask-loading">' +
            '<span class="loading-spinner"></span>' +
            'AI가 생각 중...' +
          '</div>';
      };

      const renderAskError = (message) => {
        askResultArea.innerHTML =
          '<div class="ask-error">' + escapeHtml(message) + '</div>';
      };

      const renderAskAnswerMarkdown = (answer) => {
        const trimmed = (answer || '').trim();
        if (trimmed.length === 0) {
          return '<div class="ask-answer-body"><em>답변이 비어 있습니다.</em></div>';
        }
        const rawHtml = window.marked && typeof window.marked.parse === 'function'
          ? window.marked.parse(trimmed, { gfm: true, breaks: false })
          : escapeHtml(trimmed);
        const safe = window.DOMPurify
          ? window.DOMPurify.sanitize(rawHtml)
          : rawHtml;
        return '<div class="ask-answer-body">' + safe + '</div>';
      };

      const renderAskSources = (sources) => {
        const list = Array.isArray(sources) ? sources : [];
        if (list.length === 0) return '';
        const chips = list.map(source => {
          const id = source && source.id ? String(source.id) : '';
          const title = source && source.title ? String(source.title) : id;
          if (!id) return '';
          return '<button type="button" class="ask-source-chip" data-ask-source-id="' +
            escapeHtml(id) + '" title="' + escapeHtml(title) + ' 문서 열기">' +
            '<span class="ask-source-chip-icon" aria-hidden="true">📄</span>' +
            escapeHtml(title) +
          '</button>';
        }).join('');
        return '<div class="ask-answer-section">' +
                 '<span class="ask-section-label">출처</span>' +
                 '<div class="ask-sources-list">' + chips + '</div>' +
               '</div>';
      };

      const renderAskAnswer = (question, payload) => {
        askResultArea.innerHTML =
          '<div class="ask-answer-card">' +
            '<div class="ask-question-echo">' +
              '<span class="ask-question-echo-label">질문</span>' +
              escapeHtml(question) +
            '</div>' +
            '<div class="ask-answer-section">' +
              '<span class="ask-section-label">답변</span>' +
              renderAskAnswerMarkdown(payload.answer) +
            '</div>' +
            renderAskSources(payload.sources) +
          '</div>';
      };

      const submitAskQuestion = async () => {
        const question = askQuestionInput.value.trim();
        if (question.length === 0 || askInFlight) return;

        askInFlight = true;
        updateAskSubmitState();
        renderAskLoading();

        try {
          const response = await fetch('/ask', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ question }),
          });

          let payload = null;
          try {
            payload = await response.json();
          } catch (_parseError) {
            payload = null;
          }

          if (!response.ok) {
            const message = (payload && payload.message) ||
              (response.status === 503
                ? 'AI 답변 기능이 설정되지 않았습니다. (OPENROUTER_API_KEY 미설정)'
                : '답변 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.');
            renderAskError(message);
            return;
          }

          if (!payload || typeof payload.answer !== 'string') {
            renderAskError('서버 응답을 해석할 수 없습니다.');
            return;
          }

          renderAskAnswer(question, payload);
        } catch (error) {
          console.error('Ask failed:', error);
          renderAskError('네트워크 오류가 발생했습니다.');
        } finally {
          askInFlight = false;
          updateAskSubmitState();
        }
      };

      askQuestionInput.addEventListener('input', updateAskSubmitState);

      askQuestionInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
          event.preventDefault();
          submitAskQuestion();
        }
      });

      askSubmitButton.addEventListener('click', submitAskQuestion);

      askResultArea.addEventListener('click', (event) => {
        const chip = event.target.closest('[data-ask-source-id]');
        if (!chip) return;
        const id = chip.dataset.askSourceId;
        if (!id) return;
        switchToTab('browse');
        fetchAndShowDetail(id);
      });

      renderAskEmpty();
      updateAskSubmitState();

      // Initial browse load
      initialLoad();
    </script>
  </body>
</html>`;
};
