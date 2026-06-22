export class SummaryGeneratorNotConfiguredError extends Error {
  constructor() {
    super('summary must be provided when OpenRouter is not configured');
    this.name = 'SummaryGeneratorNotConfiguredError';
  }
}
