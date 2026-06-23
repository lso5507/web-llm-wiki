/**
 * Generates vector embeddings from text for semantic search.
 * Implementations MUST return L2-normalized vectors for accurate cosine similarity.
 */
export interface EmbeddingGenerator {
  /**
   * Generate a normalized embedding vector for a single text input.
   * @param text - Input text (typically document summary or query)
   * @returns L2-normalized vector of length {@link dimensions}
   * @throws On network/timeout failure or invalid input
   */
  embed(text: string): Promise<readonly number[]>;

  /**
   * Generate embeddings for multiple texts in a single batch.
   * More efficient than calling {@link embed} repeatedly.
   * @param texts - Array of input texts
   * @returns Array of L2-normalized vectors, same order as input
   * @throws On network/timeout failure or invalid input
   */
  embedBatch(texts: readonly string[]): Promise<readonly (readonly number[])[]>;

  /**
   * Unique identifier for the embedding model (e.g., "multilingual-e5-small").
   * Used to detect dimension mismatches when loading cached embeddings.
   */
  readonly modelId: string;

  /**
   * Dimensionality of output vectors (e.g., 384 for multilingual-e5-small).
   */
  readonly dimensions: number;
}
