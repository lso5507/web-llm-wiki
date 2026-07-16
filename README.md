# LLM Wiki

> Andrej Karpathy의 [LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) 아이디어를 기반으로 구현한 웹 기반 지식 관리 시스템

---

## 프로젝트 목적

기존 RAG(Retrieval-Augmented Generation) 방식의 한계를 극복하고, **지식이 축적되는 위키**를 구축하는 것을 목표로 합니다.

RAG는 질문할 때마다 문서에서 지식을 재발견하지만, LLM Wiki는 다릅니다. 문서를 저장하는 순간 LLM이 내용을 분석하고, 도메인을 분류하고, 기존 문서와의 연결고리를 자동으로 형성합니다. 질문에 답할 때는 이미 구조화된 지식에서 응답하므로 훨씬 정확하고 일관된 결과를 제공합니다.

특히 이 프로젝트는 **멀티 사용자 환경**에서의 지식 관리에 집중합니다. 사용자마다 제각각인 폴더 구조, 분류 방식 대신 시스템이 자동으로 일관된 도메인 분류 체계를 유지합니다. 여러 사람이 공동으로 위키를 작성할 때 생기는 구조 파편화와 지식 충돌 문제를 시스템 수준에서 해결합니다.

---

## Pain Point 해소

### 1. 주관적 폴더 구조로 인한 혼란

**문제:** 각 사용자가 자신만의 기준으로 문서를 분류하면, 팀 위키는 금방 제각각의 구조를 갖게 됩니다. A는 "배송정책"이라고 폴더를 만들고, B는 "물류/배송"에 저장하고, C는 루트에 파일을 쌓습니다.

**해결:** LLM이 문서 내용을 분석해 **13개의 표준 도메인** 중 하나로 자동 분류합니다. 사용자가 분류를 신경 쓰지 않아도 시스템이 `shipping`, `payment`, `refund` 등 정규화된 도메인으로 정리합니다. 새로운 개념이 등장하면 도메인이 동적으로 확장되며, 기존 문서들과의 일관성을 유지합니다.

```
도메인 분류 예시
"배송비용 관련 안내" → shipping
"환불 및 반품 정책"  → refund
"이벤트 쿠폰 안내"  → marketing
```

### 2. 파편화된 지식의 충돌 감지 불가

**문제:** 여러 문서에 같은 주제의 내용이 분산되어 있을 때, 어느 순간부터 서로 모순되는 정보가 공존합니다. 배송비가 "3,000원"이라는 문서와 "무료"라는 문서가 동시에 존재해도 아무도 알아차리지 못합니다.

**해결:** 문서 저장 시 **두 단계 충돌 감지**가 작동합니다.

- **구조적 충돌:** 동일 제목, 5개 이상의 태그 중복 → 즉시 플래그 처리
- **의미론적 충돌:** LLM이 같은 도메인 내 문서들을 비교해 가격, 날짜, 수량, 정책 등의 실제 사실 모순을 탐지

충돌이 감지되면 헤더의 알림 아이콘에 뱃지가 표시되고, 사용자는 두 문서를 나란히 비교해 어느 내용이 올바른지 직접 판단할 수 있습니다.

### 3. Ask AI 응답의 신뢰성 문제

**문제:** 충돌된 지식이 있는 상태에서 AI에게 질문하면, AI는 모순된 두 문서 중 하나를 임의로 선택해 답합니다. 사용자는 잘못된 정보를 사실로 믿을 수 있습니다.

**해결:** Ask AI는 관련 문서를 검색하기 전에 충돌 여부를 먼저 확인합니다. 충돌된 문서가 포함되면 답변 대신 충돌 해결을 먼저 요청합니다. 지식이 정확해야만 답변을 생성합니다.

### 4. 문서 간 연결 관계 누락

**문제:** 관련 있는 문서들이 서로 연결되지 않으면, 지식 베이스는 고립된 섬들의 집합이 됩니다. 직원이 수동으로 링크를 달지 않으면 연관 정보를 찾기 어렵습니다.

**해결:** 문서 저장 시 기존 문서 제목이 본문에 언급되면 `[[링크]]` 형식으로 자동 연결됩니다. 끊어진 링크는 빨간색으로 표시되어 즉시 확인 가능합니다.

---

## 시스템 아키텍처

헥사고날 아키텍처(Ports & Adapters)를 기반으로 도메인 로직을 외부 의존성으로부터 완전히 격리합니다.

```
┌─────────────────────────────────────────────────────────┐
│                    Presentation Layer                    │
│              Web Browser (Single Page App)               │
│         Write / Browse / Ask AI / Conflict View          │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTP (Hono)
┌───────────────────────▼─────────────────────────────────┐
│                  Infrastructure Layer                    │
│                                                          │
│  ┌─────────────────┐    ┌──────────────────────────┐    │
│  │   HTTP Routes   │    │       LLM Adapters       │    │
│  │  (Hono Router)  │    │  OpenRouter API          │    │
│  └────────┬────────┘    │  - Summary Generator     │    │
│           │             │  - Domain Classifier     │    │
│           │             │  - Semantic Conflict Det │    │
│           │             │  - Question Answerer     │    │
│           │             └──────────────────────────┘    │
│                                                          │
│  ┌──────────────────────────────────────────────┐        │
│  │           Persistence Adapters               │        │
│  │  FileSystem Repository  │  In-Memory (test)  │        │
│  │  (YAML frontmatter .md) │                    │        │
│  └──────────────────────────────────────────────┘        │
└───────────────────────┬─────────────────────────────────┘
                        │ Ports (Interfaces)
┌───────────────────────▼─────────────────────────────────┐
│                  Application Layer                       │
│                                                          │
│  Use Cases                                               │
│  ├── SaveDocument      ← 저장 + 분류 + 링크 + 충돌감지   │
│  ├── AskAI             ← 시맨틱 검색 + 질의응답          │
│  ├── DetectConflicts   ← 구조적 충돌 감지                │
│  ├── ListConflicts     ← 충돌 목록 조회                  │
│  ├── SuggestLinks      ← 자동 위키링크 제안              │
│  ├── ValidateLinks     ← 링크 유효성 검증                │
│  └── SearchDocuments   ← 키워드/시맨틱 검색              │
│                                                          │
│  Services                                                │
│  ├── DomainNormalizer  ← LLM 응답 → 정규 도메인 ID       │
│  └── SemanticIndexSearcher ← 임베딩 벡터 검색            │
└───────────────────────┬─────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────┐
│                    Domain Layer                          │
│                                                          │
│  WikiDocument  │  Title  │  Domain  │  Status           │
│  Frontmatter   │  DocumentMetadata  │  DocumentLinks     │
│  IndexEntry    │  HierarchyValidator                     │
│  DomainTaxonomy (13 seed domains + dynamic expansion)   │
└─────────────────────────────────────────────────────────┘
```

### 문서 저장 흐름

```
사용자 입력
    │
    ▼
Title → Slug 변환
    │
    ▼
LLM: 요약 + 도메인 추출 (OpenRouter)
    │
    ▼
Domain 정규화: 한국어 레이블 → 표준 ID
    │
    ▼
부모 문서 자동 추론 (같은 도메인 내 제목 포함 관계)
    │
    ▼
링크 제안: 본문에서 기존 문서 제목 탐지 → [[링크]] 삽입
    │
    ▼
링크 검증: 끊어진 링크 식별
    │
    ▼
문서 저장 + 인덱스 갱신
    │
    ▼
구조적 충돌 감지 (동기)
    │
    ▼
의미론적 충돌 감지 (비동기, LLM)
```

### 기술 스택

| 구성 요소 | 기술 |
|---|---|
| 런타임 | Node.js (ESM) |
| 언어 | TypeScript |
| HTTP 프레임워크 | Hono |
| LLM | OpenRouter API (모델 교체 가능) |
| 로컬 임베딩 | `@xenova/transformers` |
| 데이터 저장 | 파일시스템 (YAML Frontmatter + Markdown) |
| 테스트 | Vitest |

### 데이터 저장 형식

각 문서는 YAML frontmatter가 포함된 마크다운 파일로 저장됩니다.

```markdown
---
title: 배송비 정책
status: published
domain: shipping
tags: [배송, 정책, 무료배송]
sources: []
conflict: false
conflictWith: []
semanticConflicts:
  - conflictingDocumentSlug: shipping-fee-2024
    conflictingDocumentTitle: 2024년 배송비 안내
    explanation: "배송비 기준 금액이 서로 다름 (30,000원 vs 50,000원)"
    confidence: high
outbound: [shipping-policy]
broken: []
parent: null
---

5만원 이상 구매 시 무료배송이 적용됩니다.
```

---

## 개선점

### 1. 계층 구조 자동화의 한계

현재 부모 문서는 **제목 포함 관계**와 **도메인 일치** 조건으로 자동 추론합니다. 하지만 제목 유사도에만 의존하기 때문에 의미적으로 상위 개념인 문서를 정확하게 찾지 못하는 경우가 있습니다. LLM이 문서 관계를 직접 판단하는 방식으로 개선하면 더 정확한 계층 구조를 만들 수 있습니다.

### 2. 의미론적 충돌 감지의 비동기 처리

현재 의미론적 충돌 감지는 문서 저장 후 백그라운드에서 실행됩니다. 이는 응답 속도를 위한 트레이드오프이지만, 저장 직후 충돌이 즉시 반영되지 않는다는 단점이 있습니다. SSE(Server-Sent Events)나 웹소켓으로 충돌 감지 결과를 실시간 푸시하면 사용자 경험이 개선됩니다.

### 3. 임베딩 벡터의 인메모리 저장

현재 문서 임베딩 벡터는 인메모리에만 저장되어 서버 재시작 시 초기화됩니다. 벡터 DB(예: SQLite with vec0, Chroma)를 도입해 영속성을 확보하면 재시작 후에도 즉시 시맨틱 검색이 가능해집니다.

### 4. 멀티 사용자 동시 편집

현재 파일 시스템 기반 저장소는 동시 쓰기 충돌을 처리하지 않습니다. 락 메커니즘 또는 이벤트 소싱 패턴을 도입해 여러 사용자가 동시에 같은 문서를 편집하는 시나리오를 안전하게 처리할 수 있습니다.

### 5. 충돌 해결 워크플로우

현재는 충돌을 탐지하고 비교 뷰를 제공하는 데 그칩니다. 두 문서 중 어느 것이 최신/정확한지 선택하면 나머지 문서가 자동 업데이트되거나 deprecated 처리되는 **충돌 해결 워크플로우**를 추가하면 지식 베이스의 건강성을 더 쉽게 유지할 수 있습니다.

### 6. 도메인 분류 정확도

LLM 기반 도메인 분류는 강력하지만 API 비용이 발생합니다. 충분한 문서가 축적되면 기존 분류 데이터를 학습 데이터로 활용해 로컬 분류기(예: fastText)를 훈련하는 방향도 고려할 수 있습니다.

---

## 주요 기능

### Write
- EasyMDE 기반 마크다운 WYSIWYG 에디터
- 저장 시 LLM이 자동 요약(summary), 도메인 분류, `[[link]]` 검증/제안, 같은 도메인 내 의미론적 충돌 감지 수행
- 자동 저장 (drafting), 도메인/태그 입력

### Browse
- 2-pane 레이아웃 (목록 + 상세 패널)
- 검색/필터, 계층형 트리 탐색, 마크다운 렌더링, `[[links]]` 클릭 탐색
- 충돌 배너, 출처(sources) 뱃지, 의미론적 충돌 경고 표시
- 편집/삭제 (편집 → Write 탭 프리필)

### Ask AI
- 누적된 위키에 자연어 질의
- LLM이 관련 문서를 컨텍스트로 답변
- 출처 뱃지 클릭 → 문서 상세 패널

## 빠른 시작

```bash
# 1) 의존성 설치
npm install

# 2) .env 설정
#    OPENROUTER_API_KEY=sk-or-...
#    (key 미설정 시 summary/domain/ask 기능 비활성화, 저장은 가능)

# 3) 개발 서버
npm run dev
# → http://127.0.0.1:3000

# 4) 다른 포트로 실행
PORT=3010 npm run dev
```

## 환경 변수 (`.env`)

| 변수                  | 기본값                  | 설명                                                           |
| --------------------- | ----------------------- | -------------------------------------------------------------- |
| `OPENROUTER_API_KEY`  | (없음)                  | OpenRouter API 키. 없으면 summary/domain/ask 기능 비활성화. |
| `OPENROUTER_MODEL`    | `openai/gpt-4o-mini`    | summary/domain 기본 모델.                                      |
| `OPENROUTER_DOMAIN_MODEL` | `OPENROUTER_MODEL` | (선택) 도메인 분류 전용 모델 오버라이드.                       |
| `OPENROUTER_ASK_MODEL`    | `OPENROUTER_MODEL` | (선택) Ask AI 전용 모델 오버라이드.                            |
| `OPENROUTER_SEMANTIC_CONFLICT_MODEL` | `OPENROUTER_MODEL` | (선택) 의미론적 충돌 감지 전용 모델 오버라이드.                 |
| `USE_FILE_STORAGE`    | `false`                 | `true`면 in-memory 어댑터를 파일 어댑터로 교체.                |
| `DATA_ROOT`           | `./data`                | 파일 어댑터 루트 디렉토리 (`USE_FILE_STORAGE=true` 시 사용).   |
| `PORT`                | `3000`                  | HTTP 서버 포트.                                                |
| `HOST`                | `127.0.0.1`             | 바인딩 호스트.                                                 |

## 스크립트

```bash
npm run dev        # 개발 서버 (build:runtime → node)
npm run start      # 동일 (production-style)
npm test           # vitest run (370 tests)
npm run test:watch # vitest watch mode
npm run typecheck  # tsc --noEmit
```

## 아키텍처

DDD + Hexagonal (Ports & Adapters) 구조.

```
src/
├── domain/                    # 도메인 모델 (외부 의존 0)
│   └── wiki/
│       ├── title.ts
│       ├── frontmatter.ts
│       ├── index-entry.ts
│       ├── document.ts
│       ├── status.ts
│       ├── domain.ts
│       ├── document-metadata.ts
│       └── document-links.ts
│
├── application/               # 유스케이스 + 포트
│   ├── ports/                 # 의존성 역전 인터페이스
│   │   ├── document-repository.ts
│   │   ├── index-catalog.ts
│   │   ├── document-summary-generator.ts
│   │   ├── domain-classifier.ts
│   │   └── question-answerer.ts
│   ├── use-cases/             # 비즈니스 로직 (포트만 의존)
│   │   ├── save-document.ts
│   │   ├── list-index.ts
│   │   ├── get-document.ts
│   │   ├── search-documents.ts
│   │   ├── update-document.ts
│   │   ├── delete-document.ts
│   │   ├── ask-ai.ts
│   │   ├── detect-conflicts.ts
│   │   ├── reconcile-conflicts.ts
│   │   ├── suggest-links.ts
│   │   └── validate-links.ts
│   ├── dto/
│   └── errors/
│
└── infrastructure/            # 어댑터 (포트 구현)
    ├── http/                  # 인바운드 어댑터
    │   ├── server.ts
    │   ├── routes/
    │   └── views/home.ts
    ├── llm/                   # 아웃바운드 (OpenRouter)
    │   ├── openrouter-document-summary-generator.ts
    │   ├── openrouter-domain-classifier.ts
    │   └── openrouter-question-answerer.ts
    ├── persistence/           # 아웃바운드 저장소
    │   ├── in-memory/
    │   └── filesystem/
    └── config/
        ├── composition-root.ts
        └── env.ts
```

### 의존성 방향

```
infrastructure  →  application  →  domain
   (어댑터)         (유스케이스)      (모델)
```

- **domain**: 외부 의존 없음 (순수 TypeScript).
- **application**: 포트(인터페이스)만 정의/사용. 구체 어댑터 모름.
- **infrastructure**: 포트를 구현. Composition Root에서 와이어링.

### 포트 / 어댑터 매트릭스

| 포트 (application)               | 어댑터 (infrastructure)                                                        |
| -------------------------------- | ------------------------------------------------------------------------------ |
| `DocumentRepository`             | `InMemoryDocumentRepository`, `FileSystemDocumentRepository`                   |
| `IndexCatalog`                   | `InMemoryIndexCatalog`, `FileSystemIndexCatalog`                               |
| `DocumentSummaryGenerator`       | `OpenRouterDocumentSummaryGenerator` + (없을 때) `SummaryRequiredDocumentSummaryGenerator` |
| `DomainClassifier`               | `OpenRouterDomainClassifier` (선택)                                            |
| `QuestionAnswerer`               | `OpenRouterQuestionAnswerer` (선택, Ask AI)                                    |
| `SemanticConflictDetector`       | `OpenRouterSemanticConflictDetector` (선택, 같은 domain 문서 비교)             |

### HTTP 엔드포인트

| Method | Path                       | 설명                                  |
| ------ | -------------------------- | ------------------------------------- |
| GET    | `/`                        | 홈 화면 HTML (Write/Browse/Ask)       |
| POST   | `/documents`               | 문서 저장 (auto summary/domain/links) |
| GET    | `/documents/:id`           | 문서 단건 조회                        |
| PUT    | `/documents/:id`           | 문서 수정                             |
| DELETE | `/documents/:id`           | 문서 삭제                             |
| GET    | `/documents/search?q=...`  | 문서 검색                             |
| GET    | `/index`                   | 인덱스 카탈로그                       |
| POST   | `/ask`                     | Ask AI (질의 → LLM 답변 + 출처)       |

### 에러 응답 정책

| 상황                  | HTTP | 본문                              |
| --------------------- | ---- | --------------------------------- |
| 빈 title / summary    | 400  | `{ message: "..." }`              |
| malformed JSON        | 400  | `{ message: "invalid_json" }`     |
| oversized body        | 413  | `{ message: "payload_too_large" }`|
| 저장소 한도 도달      | 503  | `{ message: "storage_exhausted" }`|
| 기타 처리 안 된 예외  | 500  | `{ message: "internal_error" }`   |

## 테스트

```bash
npm test
# Test Files  36 passed (36)
#      Tests 370 passed (370)
```

테스트는 도메인/유스케이스/HTTP 라우트/LLM 어댑터/영속화 어댑터 전체 계층을 커버한다. 모든 LLM 어댑터 테스트는 `fetch`를 mocking 하여 외부 API 호출 없이 실행된다.

## 알려진 제한사항

- **단일 사용자 가정**: 동시성 제어/락 없음. 파일 어댑터에서 lost-update 가능.
- **인덱스 정렬**: 삽입/갱신 순서, 정렬 옵션 미지원.
- **검색**: 단순 substring, 전문 검색 없음.
- **인증/인가 없음**: 로컬/내부망 단일 사용자 시나리오에 한정.
- **OpenRouter 의존**: API 키 없으면 summary/domain/ask 비활성화.
- **문서 ID = title-derived slug**: 동일 title 재저장은 업데이트로 동작.

## 라이선스

Private.
