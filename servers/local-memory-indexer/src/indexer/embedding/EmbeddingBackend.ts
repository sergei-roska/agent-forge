export interface EmbedOptions {
  /** Per-request abort timeout in milliseconds. */
  timeoutMs?: number;
}

export interface HealthCheckResult {
  healthy: boolean;
  /** Round-trip time in ms, or -1 if failed. */
  latencyMs: number;
}

export interface EmbeddingBackend {
  readonly name: 'ollama' | 'transformers_js';
  readonly batchSize: number;

  /** Embed a batch of texts. Returns one vector per text. */
  embed(texts: string[], opts?: EmbedOptions): Promise<number[][]>;

  /** Returns structured health result including latency. */
  healthCheck(): Promise<HealthCheckResult>;
}
