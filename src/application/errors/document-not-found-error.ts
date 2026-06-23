export class DocumentNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Document not found: ${id}`);
    this.name = 'DocumentNotFoundError';
  }
}
