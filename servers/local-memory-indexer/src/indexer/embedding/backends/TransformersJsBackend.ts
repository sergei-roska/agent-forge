import { DEFAULT_BATCH_SIZE_TRANSFORMERS } from '../../../constants.js';
import { rootLogger } from '../../../observability/logger.js';
import type {
  EmbeddingBackend,
  EmbedOptions,
  HealthCheckResult,
  BackendCapabilities,
} from '../EmbeddingBackend.js';

const log = rootLogger.child({ component: 'TransformersJsBackend' });

const DEFAULT_TRANSFORMERS_MODEL =
  process.env['TRANSFORMERS_MODEL'] ?? 'Xenova/multilingual-e5-large';

type Pipeline = (
  texts: string | string[],
  opts: Record<string, unknown>,
) => Promise<{ data: Float32Array; dims: number[] }>;

export class TransformersJsBackend implements EmbeddingBackend {
  readonly name = 'transformers_js' as const;
  readonly batchSize: number;

  private pipeline: Pipeline | null = null;
  private cancelled = false;
  private vectorDim: number | null = null;
  private readonly modelName: string;

  constructor(modelName?: string, batchSize?: number) {
    this.modelName = modelName ?? DEFAULT_TRANSFORMERS_MODEL;
    this.batchSize = batchSize ?? DEFAULT_BATCH_SIZE_TRANSFORMERS;
  }

  async initialize(): Promise<void> {
    await this.getPipeline();
  }

  private async getPipeline(): Promise<Pipeline> {
    if (this.pipeline) return this.pipeline;

    log.info('loading embedding model', { model: this.modelName });

    const { pipeline } = await import('@huggingface/transformers');
    this.pipeline = (await pipeline('feature-extraction', this.modelName, {
      dtype: 'q8',
      progress_callback: (progress: { status?: string; progress?: number; file?: string }) => {
        if (progress.status === 'downloading' && progress.progress != null) {
          log.info('model download progress', {
            file: progress.file,
            percent: Math.round(progress.progress * 100),
          });
        } else if (progress.status === 'progress' && progress.progress != null) {
          log.info('model load progress', { percent: Math.round(progress.progress * 100) });
        }
      },
    })) as unknown as Pipeline;

    log.info('embedding model loaded', { model: this.modelName });
    return this.pipeline;
  }

  cancel(): void {
    this.cancelled = true;
  }

  // EmbedOptions.timeoutMs is intentionally unused: ONNX inference is synchronous.
  async embed(texts: string[], _opts?: EmbedOptions): Promise<number[][]> {
    if (this.cancelled) throw new Error('Embedding cancelled');

    const pipe = await this.getPipeline();
    const results: number[][] = [];

    const SUB_BATCH_SIZE = 16;
    for (let i = 0; i < texts.length; i += SUB_BATCH_SIZE) {
      if (this.cancelled) throw new Error('Embedding cancelled');

      const batchTexts = texts.slice(i, i + SUB_BATCH_SIZE);
      const output = await pipe(batchTexts, { pooling: 'mean', normalize: true });
      
      const dims = output.dims ?? [];
      const vectorDim = dims[dims.length - 1] ?? (output.data.length / batchTexts.length);
      
      if (this.vectorDim == null) {
        this.vectorDim = vectorDim;
      }

      const data = output.data;
      for (let j = 0; j < batchTexts.length; j++) {
        const start = j * vectorDim;
        const end = start + vectorDim;
        results.push(Array.from(data.slice(start, end)));
      }

      await new Promise<void>((r) => setImmediate(r));
    }

    return results;
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      await this.embed(['health check']);
      return { healthy: true, latencyMs: Date.now() - start };
    } catch {
      return { healthy: false, latencyMs: -1 };
    }
  }

  async getCapabilities(): Promise<BackendCapabilities> {
    let dimensions = this.vectorDim ?? 1024;
    try {
      if (!this.pipeline) {
        await this.initialize();
      }
      if (this.vectorDim == null) {
        const vectors = await this.embed(['capability probe']);
        dimensions = vectors[0]?.length ?? dimensions;
      } else {
        dimensions = this.vectorDim;
      }
    } catch {
      // Report defaults when model cannot load
    }

    return {
      name: 'transformers_js',
      model: this.modelName,
      available: this.pipeline != null,
      gpuAccelerated: false,
      maxBatchSize: this.batchSize,
      dimensions,
      estimatedThroughput: '~50 chunks/min',
    };
  }
}
