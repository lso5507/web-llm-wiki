# 런타임 빌드의 운영체제 호환성

## 배경

런타임 빌드가 Unix 전용 `rm` 명령을 사용해 Windows에서 실행되지 않았다.

## 변경점

Node.js 파일 시스템 API로 `.runtime` 디렉터리를 정리하는 스크립트를 추가했다. TypeScript 컴파일러도 Node로 직접 실행해 운영체제별 실행 파일 선택 차이를 없앴다.

## 결과

같은 npm 명령을 Windows와 Unix 환경에서 실행할 수 있다.
