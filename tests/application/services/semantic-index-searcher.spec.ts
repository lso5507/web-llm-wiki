import { describe, it, expect, beforeEach } from 'vitest';
import { SemanticIndexSearcher } from '../../../src/application/services/semantic-index-searcher.js';
import { InMemoryEmbeddingStore } from '../../../src/infrastructure/persistence/in-memory/in-memory-embedding-store.js';

describe('SemanticIndexSearcher', () => {
  let store: InMemoryEmbeddingStore;
  let searcher: SemanticIndexSearcher;

  beforeEach(() => {
    store = new InMemoryEmbeddingStore();
    searcher = new SemanticIndexSearcher(store);
  });

  it('should return empty array when no embeddings stored', async () => {
    const queryVector = [1, 0, 0];
    const results = await searcher.findTopK(queryVector, 3);
    expect(results).toEqual([]);
  });

  it('should rank documents by cosine similarity', async () => {
    await store.put('doc-a', [1, 0, 0], 'test-model');
    await store.put('doc-b', [0, 1, 0], 'test-model');
    await store.put('doc-c', [0.7071, 0.7071, 0], 'test-model');

    const queryVector = [1, 0, 0];
    const results = await searcher.findTopK(queryVector, 3);

    expect(results).toHaveLength(2);
    expect(results[0]?.slug).toBe('doc-a');
    expect(results[0]?.score).toBeCloseTo(1.0, 4);
    expect(results[1]?.slug).toBe('doc-c');
    expect(results[1]?.score).toBeCloseTo(0.7071, 4);
  });

  it('should limit results to top K', async () => {
    await store.put('doc-a', [1, 0, 0], 'test-model');
    await store.put('doc-b', [0.9, 0.1, 0], 'test-model');
    await store.put('doc-c', [0.8, 0.2, 0], 'test-model');
    await store.put('doc-d', [0, 1, 0], 'test-model');

    const queryVector = [1, 0, 0];
    const results = await searcher.findTopK(queryVector, 2);

    expect(results).toHaveLength(2);
    expect(results[0]?.slug).toBe('doc-a');
    expect(results[1]?.slug).toBe('doc-b');
  });

  it('should filter out zero similarity documents', async () => {
    await store.put('doc-a', [1, 0, 0], 'test-model');
    await store.put('doc-b', [0, 1, 0], 'test-model');
    await store.put('doc-c', [0, 0, 1], 'test-model');

    const queryVector = [1, 0, 0];
    const results = await searcher.findTopK(queryVector, 5);

    expect(results).toHaveLength(1);
    expect(results[0]?.slug).toBe('doc-a');
  });

  it('should handle normalized vectors correctly', async () => {
    const norm = Math.sqrt(2);
    await store.put('doc-a', [1 / norm, 1 / norm, 0], 'test-model');
    await store.put('doc-b', [1 / norm, -1 / norm, 0], 'test-model');

    const queryVector = [1 / norm, 1 / norm, 0];
    const results = await searcher.findTopK(queryVector, 2);

    expect(results).toHaveLength(1);
    expect(results[0]?.slug).toBe('doc-a');
    expect(results[0]?.score).toBeCloseTo(1.0, 4);
  });

  it('should throw on dimension mismatch', async () => {
    await store.put('doc-a', [1, 0, 0], 'test-model');

    const queryVector = [1, 0];
    await expect(searcher.findTopK(queryVector, 1)).rejects.toThrow('dimension mismatch');
  });
});
