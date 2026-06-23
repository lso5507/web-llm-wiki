# web-llm-wiki TODO / STATUS

이 문서는 9-wave / 19-task 실행 계획의 진행 상태와 향후 권장 작업을 함께 관리하는 기준 문서다.

## 전체 진행 상황

- **상태**: ✅ 100% 완료 (기존 19/19 + 추가 20/20 태스크)
- **완료 날짜**: 2026-06-22
- **테스트**: 370/370 통과 (36 test files)
- **TypeScript 타입 체크**: ✅ 클린 (strict mode, 추가 unused checks 통과)

## Wave 진행 현황

| Wave | 범위                                                  | 상태       |
| ---- | ----------------------------------------------------- | ---------- |
| 0    | 프로젝트 부트스트랩 (Node/Hono/TS/Vitest, 기본 서버) | ✅ 완료    |
| 1    | 도메인 모델 기초 (Title/Frontmatter/IndexEntry/Doc) | ✅ 완료    |
| 2    | 유스케이스 기초 (SaveDocument, ListIndex)           | ✅ 완료    |
| 3    | 영속화 어댑터 (in-memory + filesystem)              | ✅ 완료    |
| 4    | HTTP 라우트 기초 + 입력 검증/에러 처리              | ✅ 완료    |
| 5    | LLM 연동 (summary, domain classifier, ask AI)       | ✅ 완료    |
| 6    | 문서 조회/검색/수정/삭제 API (CRUD 완성)            | ✅ 완료    |
| 7    | 링크/충돌 (ValidateLinks, SuggestLinks, DetectConflicts, ReconcileConflicts) | ✅ 완료 |
| 8    | UI 재설계 (탭 / EasyMDE / Browse 2-pane / 상세 패널) | ✅ 완료    |
| 9    | 최종 검증 + 문서 정리                              | ✅ 완료    |

## Task 진행 현황 (19/19 = 100%)

### Priority 1 (필수 코어)
- [x] **T1** Node/Hono/TypeScript/Vitest 부트스트랩 + 서버 기초
- [x] **T2** 도메인 모델 (Title, Frontmatter, IndexEntry, WikiDocument, Status, Domain, DocumentMetadata, DocumentLinks)
- [x] **T3** SaveDocumentUseCase + ListIndexUseCase
- [x] **T4** Ports (DocumentRepository, IndexCatalog) + In-Memory 어댑터
- [x] **T5** 입력 검증 + 에러 처리 (빈 title/summary, malformed JSON 400, oversized 413, exhausted 503)
- [x] **T6** OpenRouter 자동 summary 생성 (DocumentSummaryGenerator port + 어댑터)
- [x] **T7** 홈 화면 HTML (제목, 마크다운 에디터, 저장, 인덱스 표시)

### Priority 2 (확장 기능)
- [x] **T8** Filesystem 영속화 (FileSystemDocumentRepository, FileSystemIndexCatalog)
- [x] **T9** GetDocumentUseCase + GET `/documents/:id`
- [x] **T10** UpdateDocumentUseCase + PUT `/documents/:id`
- [x] **T11** DeleteDocumentUseCase + DELETE `/documents/:id`
- [x] **T12** SearchDocumentsUseCase + GET `/documents/search`
- [x] **T13** OpenRouter Domain Classifier (자동 도메인 분류)
- [x] **T14** ValidateLinksUseCase + SuggestLinksUseCase (교차 링크)
- [x] **T15** DetectConflictsUseCase + ReconcileConflictsUseCase
- [x] **T16** AskAIUseCase + POST `/ask` + OpenRouter QuestionAnswerer
- [x] **T17** UI 재설계 (탭 메뉴, EasyMDE, Browse 2-pane, 상세 패널)
- [x] **T18** 검색/필터 UI + 마크다운 렌더링 + `[[links]]` 클릭 + 충돌 배너
- [x] **T19** 최종 검증 + 스모크 테스트 + 문서 정리

## 추가 요구사항 진행 현황 (20/20 = 100%)

- [x] **H1** Results 탭 제거 (Write / Browse / Ask AI만 유지)
- [x] **H2** `WikiDocument.parentSlug` 및 `withParent()` 추가
- [x] **H3** `Frontmatter.parent` 추가
- [x] **H4** `HierarchyValidator` 순환 참조 검증 추가
- [x] **H5** 파일 저장소 YAML `parent` 직렬화/역직렬화
- [x] **H6** 저장/수정 유스케이스 parentSlug 처리 및 순환 참조 검사
- [x] **H7** 삭제 유스케이스 고아 처리
- [x] **H8** HTTP 문서 생성/조회/검색 응답에 parentSlug 반영
- [x] **H9** Browse UI 트리 상태 및 계층 렌더링
- [x] **H10** Browse UI 계층 들여쓰기 스타일
- [x] **S1** `SemanticConflictDetector` 포트 추가
- [x] **S2** OpenRouter 의미론적 충돌 감지 어댑터 추가 (`openai/gpt-4o-mini`, 15초 타임아웃)
- [x] **S3** `DocumentMetadata.semanticConflicts` 추가
- [x] **S4** 저장 후 비동기 의미론적 충돌 감지 통합
- [x] **S5** 같은 domain 문서만 비교
- [x] **S6** `forceSemanticConflicts` 스킵 플래그 추가
- [x] **S7** 파일 저장소 semanticConflicts 직렬화/역직렬화
- [x] **S8** HTTP 조회/검색 응답에 semanticConflicts 반영
- [x] **S9** 상세 패널 의미론적 충돌 경고 UI 추가
- [x] **S10** 전체 테스트/타입체크/빌드/브라우저 스모크 검증

## 구현된 핵심 기능

### 도메인 (`src/domain/wiki/`)
- `Title`, `Frontmatter`, `IndexEntry`, `WikiDocument`, `Status`, `Domain`, `DocumentMetadata`, `DocumentLinks`

### 유스케이스 (`src/application/use-cases/`)
- `SaveDocumentUseCase` (auto-summary, auto-domain, validate/suggest links, detect conflicts)
- `ListIndexUseCase`
- `GetDocumentUseCase`
- `SearchDocumentsUseCase`
- `UpdateDocumentUseCase`
- `DeleteDocumentUseCase`
- `AskAIUseCase`
- `DetectConflictsUseCase` / `ReconcileConflictsUseCase`
- `ValidateLinksUseCase` / `SuggestLinksUseCase`

### 포트 (`src/application/ports/`)
- `DocumentRepository`, `IndexCatalog`, `DocumentSummaryGenerator`, `DomainClassifier`, `QuestionAnswerer`, `SemanticConflictDetector`

### HTTP 라우트 (`src/infrastructure/http/routes/`)
- `GET /` 홈 화면 HTML
- `GET /index` 인덱스 조회
- `POST /documents` 저장
- `GET /documents/:id` 조회
- `PUT /documents/:id` 수정
- `DELETE /documents/:id` 삭제
- `GET /documents/search` 검색
- `POST /ask` Ask AI

### LLM 어댑터 (`src/infrastructure/llm/`)
- `OpenRouterDocumentSummaryGenerator`
- `OpenRouterDomainClassifier`
- `OpenRouterQuestionAnswerer`
- `OpenRouterSemanticConflictDetector`

### 영속화 어댑터 (`src/infrastructure/persistence/`)
- `InMemoryDocumentRepository`, `InMemoryIndexCatalog`
- `FileSystemDocumentRepository`, `FileSystemIndexCatalog`

### UI (`src/infrastructure/http/views/home.ts`)
- Write 탭: 제목, EasyMDE 마크다운 에디터, 자동 저장, 도메인/태그
- Browse 탭: 검색/필터, 2-pane 레이아웃 (목록 + 상세 패널), `[[links]]` 클릭, 충돌 배너, 출처 표시
- Ask AI 탭: 질문 입력, 답변 표시, 출처 뱃지 → 문서 상세
- 모바일 반응형

## 향후 개선 제안 (Priority 3)

### Backend
- [ ] Pending Queue (대용량 본문/LLM 호출의 비동기 처리)
- [ ] Provider 설정/연결 테스트 UI (다중 LLM provider 추상화)
- [ ] 이벤트 로그 / 재처리 (audit trail)
- [ ] 문서 상태 모델 확장 (`processing`, `completed`, `pending`) — 현재는 단순 status, 비동기 라이프사이클 필요 시 확장

### UI/UX
- [ ] 인덱스 페이지네이션 (현재는 단일 응답)
- [ ] 검색 결과 하이라이트
- [ ] 다크 모드 토글
- [ ] 문서 버전 히스토리 뷰

### 운영
- [ ] OpenRouter 외 다른 LLM provider 어댑터 (예: Anthropic 직접, OpenAI 직접)
- [ ] 인덱스 검색 성능 (대용량 시 인덱싱/캐싱)
- [ ] CI 파이프라인 (GitHub Actions)
- [ ] Docker 컨테이너 빌드

## 알려진 제한사항

- **단일 사용자 가정**: 동시성 제어/락이 없음 (파일 어댑터에서 lost-update 가능)
- **인덱스 정렬**: 현재는 삽입/갱신 시점 순서이며, 정렬 옵션 미지원
- **검색**: 단순 substring 매칭, 전문 검색 인덱스 없음
- **인증/인가 없음**: 로컬/내부망 단일 사용자 시나리오에 한정
- **OpenRouter 의존**: API 키 없으면 summary/domain/ask 기능 비활성화 (저장은 가능, summary는 명시 입력 필요)
- **문서 ID = title-derived slug**: 동일 title 재저장은 업데이트로 동작

## 업데이트 규칙

- 새 기능 구현 전: 이 파일에서 대상 항목이 있는지 확인
- 새 기능 구현 후: 완료 항목 `[x]`로 변경
- 새로 드러난 요구사항: 가장 작은 단위로 새 항목 추가
- PRD 해석 변경 시: Wave/Task 매핑을 함께 수정
