# web-llm-wiki TODO / STATUS

이 문서는 현재 구현 상태와 다음 구현 필요사항을 같이 관리하는 기준 문서다.
앞으로 작업할 때마다 이 파일의 체크 상태를 먼저 갱신한다.

## 현재 구현 완료

- [x] Node/Hono/TypeScript/Vitest 기반 서버 기초 구성
- [x] `POST /documents` 문서 저장 API
- [x] `GET /index` 인덱스 조회 API
- [x] 도메인 모델 기초 구성
  - [x] `Title`
  - [x] `Frontmatter`
  - [x] `IndexEntry`
  - [x] `WikiDocument`
- [x] 애플리케이션 유스케이스 구성
  - [x] `SaveDocumentUseCase`
  - [x] `ListIndexUseCase`
- [x] 포트/어댑터 구조 구성
  - [x] `DocumentRepository`
  - [x] `IndexCatalog`
  - [x] In-memory 저장소 어댑터
- [x] 문서 저장 시 인덱스 자동 반영
- [x] 입력 검증 및 기본 에러 처리
  - [x] 빈 title 거부
  - [x] 빈 summary 거부
  - [x] malformed JSON → `400`
  - [x] oversized body → `413`
  - [x] storage exhausted → `503`
- [x] OpenRouter 연동 자동 summary 생성
  - [x] summary 생략 시 GPT mini (`openai/gpt-4o-mini`)로 자동 요약
  - [x] `OPENROUTER_API_KEY` 환경변수 지원
- [x] `npm run dev` / `npm run start` 실행 가능
- [x] 루트 경로 `/` 기본 상태 응답 추가
- [x] 루트 경로 `/`에 실제 HTML 홈 화면 제공
- [x] Google 메인창처럼 단순한 홈 화면 구성
- [x] 제목 입력 필드
- [x] 마크다운 본문 입력 에디터
- [x] 저장 버튼
- [x] 저장 결과(`status`, `summary`) 화면 표시
- [x] 홈 화면에서 최근/기본 인덱스 목록 표시
- [x] 테스트/타입체크/실서버 스모크 검증 완료

## 현재 미구현 (다음 작업 필요)

### 1. 메인 UI / 작성 UI
- [x] `GET /`에서 JSON이 아니라 실제 HTML 페이지 제공
- [x] Google 메인창처럼 단순한 홈 화면 구성
- [x] 제목 입력 필드
- [x] 마크다운 본문 입력 에디터
- [x] 저장 버튼
- [x] 저장 결과(`status`, `summary`) 화면 표시

### 2. 문서 탐색/조회 UI
- [x] 홈 또는 별도 영역에서 최근/기본 인덱스 목록 표시
- [ ] 저장 후 생성 문서 결과 확인 UI
- [ ] 인덱스 검색/필터 기본 UX

### 3. PRD 핵심 백엔드 미구현 영역
- [ ] 파일 기반 영속화 (`wiki/`, `index.md` 실제 갱신)
- [ ] 문서 상태 모델 확장 (`processing`, `completed`, `pending`)
- [ ] LLM 기반 도메인 자동 분류
- [ ] 교차 링크 자동 생성
- [ ] 충돌 탐지
- [ ] Pending Queue
- [ ] Ask AI 질의 응답
- [ ] Provider 설정/연결 테스트 UI
- [ ] 이벤트 로그 / 재처리

## 바로 다음 권장 작업

1. [x] 루트 `/`에 실제 HTML 홈 화면 제공
2. [x] 홈 화면에 제목 + 마크다운 입력 에디터 추가
3. [x] 저장 버튼으로 `POST /documents` 연결
4. [x] 저장 성공 시 자동 summary 결과 표시
5. [x] 홈 화면 하단에 `GET /index` 결과 일부 표시
6. [ ] 저장 후 생성 문서 결과 확인 UI를 더 풍부하게 다듬기
7. [ ] 인덱스 검색/필터 기본 UX 추가

## 업데이트 규칙

- 새 기능 구현 전: 이 파일에서 대상 항목이 있는지 확인
- 새 기능 구현 후: 완료 항목 `[x]`로 변경
- 새로 드러난 요구사항: 가장 작은 단위로 새 항목 추가
- PRD 해석 변경 시: "현재 미구현"과 "바로 다음 권장 작업"을 함께 수정
