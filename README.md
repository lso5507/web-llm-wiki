# LLM Wiki

> Andrej Karpathy의 [LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) 아이디어를 기반으로 구현한 웹 기반 지식 관리 시스템

---

## 프로젝트 목적

기존 RAG 방식은 질문할 때마다 문서에서 지식을 재발견한다. 반면 LLM Wiki는 문서를 저장하는 시점에 LLM이 내용을 분석·분류하고 기존 문서와의 연결고리를 형성하여, 지식이 누적되는 구조를 만든다.

특히 **멀티 사용자 환경**에서 발생하는 폴더 구조 파편화와 지식 충돌 문제를 시스템 수준에서 해결하는 것을 핵심 목표로 한다.

---

## Pain Point 해소

### 1. 주관적 폴더 구조

사용자마다 다른 분류 기준으로 인해 팀 위키가 파편화되는 문제를 LLM 기반 **자동 도메인 분류 + 도메인 루트 자동 생성**으로 해결한다.

LLM이 문서 내용에서 도메인 레이블을 추출하고, 사용자가 저장 전 팝업에서 도메인을 확인·수정할 수 있다. 확인된 도메인으로 저장되면, 해당 도메인의 루트 문서가 없는 경우 자동으로 생성되며 이후 동일 도메인의 모든 문서는 그 아래에 위치한다.

```
첫 번째 shipping 문서 저장
  → shipping (루트 문서 자동 생성)
      └── 배송비 정책 (신규 문서)

두 번째 shipping 문서 저장
  → shipping (루트 문서 재사용)
      ├── 배송비 정책
      └── 무료배송 안내 (신규 문서)
```

### 2. 파편화된 지식의 충돌

같은 주제를 다루는 문서들이 서로 모순된 정보를 담게 되는 문제를 **두 단계 충돌 감지**로 해결한다.

- **구조적 충돌:** 동일 제목 또는 5개 이상 태그 중복 시 즉시 플래그 처리
- **의미론적 충돌:** LLM이 같은 도메인 내 문서를 비교해 가격·날짜·정책 등의 사실 모순을 탐지

충돌이 감지되면 알림 뱃지로 안내하고, 두 문서를 나란히 비교할 수 있는 뷰를 제공한다.

### 3. Ask AI 응답의 신뢰성

충돌된 지식이 존재하는 상태에서 AI가 임의로 한쪽 문서를 선택해 답하는 문제를 방지한다. Ask AI는 충돌 문서가 검색 결과에 포함되면 답변 대신 충돌 해결을 먼저 요청한다.

### 4. 문서 간 연결 누락

문서 저장 시 본문에서 기존 문서 제목을 탐지해 `[[링크]]` 형식으로 자동 연결한다. 끊어진 링크는 빨간색으로 표시된다.

---

## 동작 원리

### 1. 도메인 분류

문서를 저장할 때 사용자가 팝업에서 도메인을 최종 확인한 뒤 저장한다.

**0단계 — 저장 버튼 클릭 시 미리보기 팝업 표시**

`POST /documents/preview`를 호출해 AI 분석 결과를 저장 없이 먼저 받아온다.

```
┌─────────────────────────────────┐
│ 저장 전 도메인 확인             │
│                                 │
│ AI 요약                         │
│ [FCM 푸시 테이블 구조 분석...]  │
│                                 │
│ 도메인 ● 신뢰도 낮음            │
│ [product        ▼]              │  ← 기존 도메인 선택
│ [+ 새 도메인 생성] 선택 시      │
│ [tech-stack___________]         │  ← 직접 입력 가능
│                                 │
│        [취소]  [이대로 저장]    │
└─────────────────────────────────┘
```

**1단계 — 요약 + 레이블 추출 (LLM)**

`OpenRouterDocumentSummaryGenerator`가 문서 제목과 본문을 LLM에 전송해 요약(150~300자)과 한국어 도메인 레이블을 동시에 추출한다.

```json
{ "summary": "5만원 이상 주문 시 무료배송 정책 안내", "domain": "배송", "confidence": 0.9 }
```

**2단계 — 기존 도메인과 의미론적 비교 (DomainNormalizer)**

추출된 레이블을 현재 위키에 존재하는 도메인 목록과 LLM이 비교한다.

- **confidence ≥ 0.8** → 기존 도메인으로 귀속 (예: "배송" → `shipping`)
- **confidence < 0.8** → 신규 도메인을 kebab-case로 생성 (예: "물류창고" → `mulyu-changgо`)
- **LLM 호출 실패 시** → `domain-taxonomy.ts`의 키워드 매핑 테이블로 폴백 분류

위키에 문서가 전혀 없는 경우(첫 번째 문서)에는 비교 없이 즉시 신규 도메인을 생성한다.

**3단계 — 도메인 루트 문서 자동 생성 + 계층 배치**

사용자가 확인한 도메인으로 저장할 때, 해당 도메인의 루트 문서(`domain.value` slug)가 없으면 자동으로 생성된다. 이후 동일 도메인의 모든 문서는 이 루트 문서 아래에 배치되어 일관된 트리 구조를 유지한다.

---

### 2. 저장 방식

각 문서는 `data/wiki/{slug}.md` 경로에 **YAML frontmatter + Markdown** 형식으로 저장된다.

```
data/
├── wiki/
│   ├── index.json          ← 전체 문서 인덱스 (제목·요약·도메인)
│   ├── shipping-policy.md  ← 문서 본문 + 메타데이터
│   └── refund-guide.md
```

문서 파일 내부 구조는 다음과 같다.

```markdown
---
title: 배송비 정책
status: published
domain: shipping
tags: [배송, 무료배송]
sources: []
conflict: false
conflictWith: []
semanticConflicts:
  - conflictingDocumentSlug: shipping-fee-2024
    explanation: "기준 금액 불일치 (3만원 vs 5만원)"
    confidence: high
outbound: [refund-guide]   ← 본문에서 자동 감지된 위키링크
broken: []                 ← 존재하지 않는 링크
parent: null               ← 계층 구조 부모 슬러그
---

5만원 이상 구매 시 무료배송이 적용된다.
```

`index.json`은 Browse 탭의 목록 조회와 Ask AI의 문서 탐색에 사용되며, 문서 저장·수정·삭제 시마다 자동으로 갱신된다.

---

### 3. 충돌 감지

충돌 감지는 **구조적 충돌(동기)**과 **의미론적 충돌(비동기)** 두 단계로 나뉜다.

**구조적 충돌 — 저장 직후 즉시 실행**

`DetectConflictsUseCase`가 다음 세 조건을 검사한다.

| 조건 | 설명 |
|---|---|
| 동일 제목 | 대소문자 무시, slug가 다른 문서가 존재하면 충돌 |
| 태그 5개 이상 중복 | 두 문서의 태그 교집합이 5개 이상이면 충돌 |
| 자기 자신 링크 | 본문의 outbound 링크에 자신의 slug가 포함된 경우 |

충돌이 감지되면 frontmatter의 `conflict: true`, `conflictWith: [slug, ...]`에 기록된다.

**의미론적 충돌 — 저장 후 백그라운드에서 비동기 실행**

`OpenRouterSemanticConflictDetector`가 같은 도메인 내 모든 문서를 LLM에 전송해 **사실 모순**을 탐지한다. 단순 중복이나 표현 차이는 무시하고, 가격·날짜·수량·정책처럼 양립 불가능한 사실 충돌만 보고한다.

```json
[
  {
    "slug": "shipping-fee-2024",
    "explanation": "배송비 기준 금액 불일치 (3만원 vs 5만원)",
    "confidence": "high"
  }
]
```

결과는 frontmatter의 `semanticConflicts` 배열에 저장되며, 헤더 알림 뱃지와 Browse 탭의 충돌 경고 배너로 표시된다. Ask AI 질의 시 충돌 문서가 검색 결과에 포함되면 답변 대신 충돌 해결을 먼저 요청한다.

---

## 시스템 아키텍처

헥사고날 아키텍처(Ports & Adapters)를 기반으로 도메인 로직을 외부 의존성으로부터 완전히 격리한다.

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
│  ├── PreviewDocument   ← 저장 전 도메인 미리보기          │
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
[저장하기] 클릭
    │
    ▼
POST /documents/preview → AI 요약·도메인 분석 (저장 없음)
    │
    ▼
도메인 확인 팝업 → 사용자가 도메인 선택 또는 신규 입력
    │
    ▼
POST /documents (선택된 domain 전달)
    │
    ▼
Title → Slug 변환
    │
    ▼
Domain 정규화: 한국어 레이블 → 표준 ID
    │
    ▼
도메인 루트 문서 없으면 자동 생성 → 해당 도메인 루트 아래에 배치
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

각 문서는 YAML frontmatter가 포함된 마크다운 파일로 저장된다.

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

### 1. 충돌 감지의 비실시간 반영

의미론적 충돌 감지는 응답 속도를 위해 백그라운드에서 비동기로 실행된다. 저장 직후 충돌이 즉시 반영되지 않으므로, SSE 또는 웹소켓을 통한 실시간 푸시 방식으로 개선이 필요하다.

### 2. 도메인 루트 문서의 내용 공백

첫 번째 문서 저장 시 자동 생성되는 도메인 루트 문서는 내용이 비어 있다. 도메인 개요·관련 문서 목록·작성 가이드라인을 AI가 자동으로 채우거나, 사용자에게 입력을 유도하는 방식으로 개선이 필요하다.

### 3. 임베딩 벡터의 비영속성

문서 임베딩 벡터는 인메모리에만 저장되어 서버 재시작 시 초기화된다. 벡터 DB(SQLite vec0, Chroma 등)를 도입하면 재시작 후에도 즉시 시맨틱 검색이 가능해진다.

### 4. 충돌 해결 워크플로우 미비

현재는 충돌 탐지와 비교 뷰 제공에 그친다. 올바른 문서를 선택하면 나머지 문서가 자동으로 업데이트되거나 deprecated 처리되는 워크플로우가 추가되어야 지식 베이스의 건강성을 효율적으로 유지할 수 있다.

### 5. 멀티 사용자 동시 편집

파일 시스템 기반 저장소는 동시 쓰기 충돌을 처리하지 않는다. 락 메커니즘 또는 이벤트 소싱 패턴 도입이 필요하다.

---

## 주요 기능

### Write
- EasyMDE 기반 마크다운 WYSIWYG 에디터
- 저장 전 팝업: AI가 제안한 도메인·요약을 확인하고 수정 또는 신규 도메인 생성 가능
- 저장 시 도메인 루트 문서 자동 생성, `[[link]]` 제안, 의미론적 충돌 감지 수행
- 자동 저장, 도메인/태그 입력 지원

### Browse
- 2-pane 레이아웃 (목록 + 상세 패널)
- 검색/필터, 계층형 트리 탐색, 마크다운 렌더링, `[[links]]` 클릭 탐색
- 충돌 배너 및 의미론적 충돌 경고 표시, 편집/삭제

### Ask AI
- 누적된 위키에 자연어 질의
- LLM이 관련 문서를 컨텍스트로 답변 생성
- 충돌 문서 포함 시 답변 차단 후 충돌 해결 유도

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

현재 테스트: 403개 통과 (39개 파일)

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
│   │   ├── preview-document.ts ← 저장 전 도메인 미리보기
│   │   ├── save-document.ts
│   │   ├── list-index.ts
│   │   ├── get-document.ts
│   │   ├── search-documents.ts
│   │   ├── update-document.ts
│   │   ├── delete-document.ts
│   │   ├── ask-ai.ts
│   │   ├── detect-conflicts.ts
│   │   ├── list-conflicts.ts
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

- **domain**: 외부 의존 없음 (순수 TypeScript)
- **application**: 포트(인터페이스)만 정의/사용. 구체 어댑터를 알지 못함
- **infrastructure**: 포트를 구현. Composition Root에서 와이어링

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
| POST   | `/documents/preview`       | 저장 없이 AI 요약·도메인 미리보기     |
| GET    | `/conflicts`               | 의미론적 충돌 목록 조회               |
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
# Test Files  39 passed (39)
#      Tests  402 passed (402)
```

테스트는 도메인/유스케이스/HTTP 라우트/LLM 어댑터/영속화 어댑터 전체 계층을 커버한다. LLM 어댑터 테스트는 `fetch`를 mocking하여 외부 API 호출 없이 실행된다.

## 알려진 제한사항

- **단일 사용자 가정**: 동시성 제어/락 없음. 파일 어댑터에서 lost-update 가능.
- **인덱스 정렬**: 삽입/갱신 순서, 정렬 옵션 미지원.
- **검색**: 단순 substring, 전문 검색 없음.
- **인증/인가 없음**: 로컬/내부망 단일 사용자 시나리오에 한정.
- **OpenRouter 의존**: API 키 없으면 summary/domain/ask 비활성화.
- **문서 ID = title-derived slug**: 동일 title 재저장은 업데이트로 동작.

## 라이선스

Private.
