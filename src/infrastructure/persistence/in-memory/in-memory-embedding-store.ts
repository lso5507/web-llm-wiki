import type { EmbeddingRecord, EmbeddingStore } from '../../../application/ports/embedding-store.js';

export class InMemoryEmbeddingStore implements EmbeddingStore {
  private store = new Map<string, EmbeddingRecord>();

  async put(slug: string, vector: readonly number[], modelId: string): Promise<void> {
    this.store.set(slug, { slug, vector, modelId });
  }

  async get(slug: string): Promise<EmbeddingRecord | null> {
    return this.store.get(slug) ?? null;
  }

  async getAll(): Promise<readonly EmbeddingRecord[]> {
    return Array.from(this.store.values());
  }

  async remove(slug: string): Promise<void> {
    this.store.delete(slug);
  }
}
