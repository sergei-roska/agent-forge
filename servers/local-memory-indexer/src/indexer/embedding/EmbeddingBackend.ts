export interface EmbedOptions {
  /** Per-request abort timeout in milliseconds. */
  timeoutMs?: number;
}

export interface HealthCheckResult {
  healthy: boolean;
  /** Round-trip time in ms, or -1 if failed. */
  latencyMs: number;
}

export interface BackendCapabilities {
  name: 'ollama' | 'transformers_js';
  model: string;
  available: boolean;
  gpuAccelerated: boolean;
  maxBatchSize: number;
  dimensions: number;
  estimatedThroughput: string;
}

export interface ModelVerificationResult {
  loaded: boolean;
  modelInfo?: {
    name: string;
    size?: number;
    digest?: string;
    dimensions?: number;
  };
}

export interface EmbeddingBackend {
  readonly name: 'ollama' | 'transformers_js';
  readonly batchSize: number;

  /** Optional warm-up (e.g. model load). Called before first embed. */
  initialize?(): Promise<void>;

  /** Embed a batch of texts. Returns one vector per text. */
  embed(texts: string[], opts?: EmbedOptions): Promise<number[][]>;

  /** Returns structured health result including latency. */
  healthCheck(): Promise<HealthCheckResult>;

  /** Reports throughput, GPU support, and vector dimensions. */
  getCapabilities(): Promise<BackendCapabilities>;

  /** Best-effort cancellation for in-process backends (Transformers.js). */
  cancel?(): void;
}
