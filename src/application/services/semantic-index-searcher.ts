import type { EmbeddingStore } from '../ports/embedding-store.js';

export type RankedSlug = {
  readonly slug: string;
  readonly score: number;
};

/**
 * Semantic search service that ranks documents by cosine similarity
 * between query embedding and document summary embeddings.
 */
export class SemanticIndexSearcher {
  constructor(private readonly embeddingStore: EmbeddingStore) {}

  /**
   * Find top K documents most similar to the query vector.
   * @param queryVector - L2-normalized query embedding
   * @param k - Number of top results to return
   * @returns Array of {slug, score} sorted by descending similarity
   */
  async findTopK(queryVector: readonly number[], k: number): Promise<readonly RankedSlug[]> {
    const records = await this.embeddingStore.getAll();
    
    const ranked = records
      .map((record) => ({
        slug: record.slug,
        score: cosineSimilarity(queryVector, record.vector),
      }))
      .filter((entry) => entry.score > 0) // Filter out zero similarity
      .sort((a, b) => b.score - a.score)
      .slice(0, k);

    return ranked;
  }
}

/**
 * Compute cosine similarity between two L2-normalized vectors.
 * Since vectors are normalized, this is equivalent to dot product.
 */
const cosineSimilarity = (a: readonly number[], b: readonly number[]): number => {
  if (a.length !== b.length) {
    throw new Error(
      `Vector dimension mismatch: ${a.length} vs ${b.length}`,
    );
  }
  
  let dotProduct = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i]! * b[i]!;
  }
  
  return dotProduct;
};
