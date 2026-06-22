export class ContentRequiredForSummaryGenerationError extends Error {
  constructor() {
    super('content is required when summary is omitted');
    this.name = 'ContentRequiredForSummaryGenerationError';
  }
}
