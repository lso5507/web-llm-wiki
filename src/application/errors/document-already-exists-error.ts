export class DocumentAlreadyExistsError extends Error {
  constructor(public readonly id: string) {
    super(`같은 제목의 문서가 이미 존재합니다: ${id}`);
    this.name = 'DocumentAlreadyExistsError';
  }
}
