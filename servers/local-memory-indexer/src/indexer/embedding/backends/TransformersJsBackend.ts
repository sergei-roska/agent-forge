import { DEFAULT_BATCH_SIZE_TRANSFORMERS } from '../../../constants.js';
import type { EmbeddingBackend } from '../EmbeddingBackend.js';

// Xenova/multilingual-e5-large → 1024-dim, good multilingual quality, ~560 MB.
// Change via TRANSFORMERS_MODEL env var.
const DEFAULT_TRANSFORMERS_MODEL =
  process.env['TRANSFORMERS_MODEL'] ?? 'Xenova/multilingual-e5-large';

type Pipeline = (texts: string | string[], opts: Record<string, unknown>) => Promise<{ data: Float32Array; dims: number[] }>;

export class TransformersJsBackend implements EmbeddingBackend {
  readonly name = 'transformers_js' as const;
  readonly batchSize: number;

  private pipeline: Pipeline | null = null;
  private readonly modelName: string;

  constructor(modelName?: string, batchSize?: number) {
    this.modelName = modelName ?? DEFAULT_TRANSFORMERS_MODEL;
    this.batchSize = batchSize ?? DEFAULT_BATCH_SIZE_TRANSFORMERS;
  }

  private async getPipeline(): Promise<Pipeline> {
    if (this.pipeline) return this.pipeline;

    // Dynamic import — keeps startup fast when using Ollama
    const { pipeline } = await import('@xenova/transformers');
    this.pipeline = (await pipeline('feature-extraction', this.modelName, {
      quantized: true,
    })) as unknown as Pipeline;

    return this.pipeline;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const pipe = await this.getPipeline();
    const results: number[][] = [];

    for (const text of texts) {
      const output = await pipe(text, { pooling: 'mean', normalize: true });
      // output.data is a flat Float32Array; output.dims = [1, vectorDim]
      results.push(Array.from(output.data));
    }

    return results;
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.getPipeline();
      return true;
    } catch {
      return false;
    }
  }
}
