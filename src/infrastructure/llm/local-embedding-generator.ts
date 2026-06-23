import { pipeline } from '@xenova/transformers';
import type { EmbeddingGenerator } from '../../application/ports/embedding-generator.js';

export type LocalEmbeddingGeneratorOptions = {
  model?: string;
  device?: string;
};

const DEFAULT_MODEL = 'Xenova/multilingual-e5-small';
const DEFAULT_DIMENSIONS = 384;

export class LocalEmbeddingGenerator implements EmbeddingGenerator {
  private pipelinePromise: Promise<any> | null = null;
  public readonly modelId: string;
  public readonly dimensions: number;

  constructor(options: LocalEmbeddingGeneratorOptions = {}) {
    this.modelId = options.model ?? DEFAULT_MODEL;
    this.dimensions = DEFAULT_DIMENSIONS;
  }

  async embed(text: string): Promise<readonly number[]> {
    const pipe = await this.getPipeline();
    const output = await pipe(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data as Float32Array);
  }

  async embedBatch(texts: readonly string[]): Promise<readonly (readonly number[])[]> {
    const pipe = await this.getPipeline();
    const results: number[][] = [];
    
    for (const text of texts) {
      const output = await pipe(text, { pooling: 'mean', normalize: true });
      results.push(Array.from(output.data as Float32Array));
    }
    
    return results;
  }

  private async getPipeline(): Promise<any> {
    if (!this.pipelinePromise) {
      this.pipelinePromise = pipeline('feature-extraction', this.modelId, {
        quantized: true,
      });
    }
    return this.pipelinePromise;
  }
}
