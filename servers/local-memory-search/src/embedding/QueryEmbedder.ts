import { getConfig } from '../config.js';
import { SearchError, ErrorCode } from '../errors/codes.js';

/**
 * Query-time embedding (Spec 08.2 §2.3 step 2a). The query MUST be encoded with
 * the same backend the indexer used, otherwise vectors are not comparable.
 *
 * Selection: Ollama (config.embedModel) first, then Transformers.js. If neither
 * is reachable, {@link QueryEmbedder.embed} throws EMBEDDING_BACKEND_UNAVAILABLE
 * and the pipeline forces keyword-only mode (Spec 08.2 §5.5).
 */
export type EmbedderBackend = 'ollama' | 'transformers_js';

export interface EmbedResult {
  vector: number[];
  backend: EmbedderBackend;
}

type TransformersPipeline = (
  text: string,
  opts: Record<string, unknown>,
) => Promise<{ data: Float32Array }>;

export class QueryEmbedder {
  private transformersPipeline: TransformersPipeline | null = null;

  constructor(
    private readonly ollamaBaseUrl = getConfig().ollamaBaseUrl,
    private readonly embedModel = getConfig().embedModel,
  ) {}

  /** Encode one query string. Throws EMBEDDING_BACKEND_UNAVAILABLE if no backend works. */
  async embed(query: string): Promise<EmbedResult> {
    try {
      const vector = await this.embedViaOllama(query);
      if (vector) return { vector, backend: 'ollama' };
    } catch {
      /* fall through to transformers */
    }

    try {
      const vector = await this.embedViaTransformers(query);
      if (vector) return { vector, backend: 'transformers_js' };
    } catch {
      /* fall through to throw */
    }

    throw new SearchError(
      ErrorCode.EMBEDDING_BACKEND_UNAVAILABLE,
      'Query vectorization failed: neither Ollama nor Transformers.js is available.',
      { ollama_url: this.ollamaBaseUrl, model: this.embedModel },
    );
  }

  private async embedViaOllama(query: string): Promise<number[] | null> {
    const res = await fetch(`${this.ollamaBaseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.embedModel, input: [query] }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Ollama embed failed: ${res.status}`);
    const json = (await res.json()) as { embeddings?: number[][] };
    const vec = json.embeddings?.[0];
    return Array.isArray(vec) && vec.length > 0 ? vec : null;
  }

  private async embedViaTransformers(query: string): Promise<number[] | null> {
    if (!this.transformersPipeline) {
      const modelName = process.env['TRANSFORMERS_MODEL'] ?? 'Xenova/multilingual-e5-large';
      const { pipeline } = await import('@xenova/transformers');
      this.transformersPipeline = (await pipeline('feature-extraction', modelName, {
        quantized: true,
      })) as unknown as TransformersPipeline;
    }
    const out = await this.transformersPipeline(query, { pooling: 'mean', normalize: true });
    return Array.from(out.data);
  }

  /** Health probe used by health_check (does not throw). */
  async probe(): Promise<{ available: boolean; backend?: EmbedderBackend }> {
    try {
      const res = await this.embed('healthcheck');
      return { available: true, backend: res.backend };
    } catch {
      return { available: false };
    }
  }
}
