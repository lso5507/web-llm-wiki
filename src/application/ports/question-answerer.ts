export interface QuestionAnswerer {
  /**
   * Generate an answer to {@link question} using only the provided
   * {@link context} documents as ground truth.
   *
   * Implementations MUST throw on transport, timeout, or parse failure so the
   * caller can surface the error to the user. Returning an empty answer is
   * also treated as a failure and MUST throw.
   */
  answer(question: string, context: readonly string[]): Promise<string>;
}
