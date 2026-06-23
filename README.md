# web-llm-wiki

LLM-augmented personal wiki — 문서를 저장하면 LLM이 자동으로 요약/도메인 분류/링크 제안/충돌 탐지를 수행하고, Ask AI로 누적된 위키에 자연어 질의를 던질 수 있다.

> [TODO.md](./TODO.md) — 기존 19/19 + 추가 20/20 태스크 완료, 370/370 테스트 통과, TypeScript 클린

## 주요 기능

### Write
- EasyMDE 기반 마크다운 WYSIWYG 에디터
- 저장 시 LLM이 자동 요약(summary), 도메인 분류, `[[link]]` 검증/제안, 같은 도메인 내 의미론적 충돌 감지 수행
- 자동 저장 (drafting), 도메인/태그 입력
- 부모 문서 선택으로 계층형 문서 구조 구성

### Browse
- 2-pane 레이아웃 (목록 + 상세 패널)
- 검색/필터, 계층형 트리 탐색, 마크다운 렌더링, `[[links]]` 클릭 탐색
- 충돌 배너, 출처(sources) 뱃지 표시
- 의미론적 충돌 경고 표시
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

Clean Architecture + DDD + Hexagonal (Ports & Adapters) 구조.

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
