/**
 * Stores and retrieves embedding vectors for documents, keyed by slug.
 * Separate from IndexCatalog to keep domain objects clean and allow model migrations.
 */

export type EmbeddingRecord = {
  readonly slug: string;
  readonly vector: readonly number[];
  /**
   * Model identifier (e.g., "multilingual-e5-small", "text-embedding-3-small").
   * Used to detect dimension mismatches when the embedding model changes.
   */
  readonly modelId: string;
};

export interface EmbeddingStore {
  /**
   * Store or update an embedding vector for a document.
   * @param slug - Document identifier (WikiDocument.title.toSlug())
   * @param vector - L2-normalized embedding vector
   * @param modelId - Identifier of the model that generated this embedding
   */
  put(slug: string, vector: readonly number[], modelId: string): Promise<void>;

  /**
   * Retrieve the embedding for a specific document.
   * @returns EmbeddingRecord if found, null otherwise
   */
  get(slug: string): Promise<EmbeddingRecord | null>;

  /**
   * Retrieve all stored embeddings.
   * Used by SemanticIndexSearcher to rank all documents against a query.
   * @returns Array of all embedding records
   */
  getAll(): Promise<readonly EmbeddingRecord[]>;

  /**
   * Remove the embedding for a document (e.g., when document is deleted).
   * @param slug - Document identifier to remove
   */
  remove(slug: string): Promise<void>;
}
