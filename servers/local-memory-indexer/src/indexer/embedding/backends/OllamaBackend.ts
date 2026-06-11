import { DEFAULT_BATCH_SIZE_OLLAMA } from '../../../constants.js';
import type {
  EmbeddingBackend,
  EmbedOptions,
  HealthCheckResult,
  BackendCapabilities,
  ModelVerificationResult,
} from '../EmbeddingBackend.js';

export class OllamaBackend implements EmbeddingBackend {
  readonly name = 'ollama' as const;
  readonly batchSize: number;

  constructor(
    private readonly model: string,
    private readonly baseUrl: string,
    batchSize?: number,
  ) {
    this.batchSize = batchSize ?? DEFAULT_BATCH_SIZE_OLLAMA;
  }

  async embed(texts: string[], opts?: EmbedOptions): Promise<number[][]> {
    const timeoutMs = opts?.timeoutMs ?? 60_000;
    const url = `${this.baseUrl}/api/embed`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, input: texts }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      throw new Error(`Ollama embed failed: ${res.status} ${await res.text()}`);
    }

    const json = (await res.json()) as { embeddings: number[][] };
    if (!Array.isArray(json.embeddings)) {
      throw new Error(`Unexpected Ollama response shape: ${JSON.stringify(json).slice(0, 200)}`);
    }

    return json.embeddings;
  }

  /** Returns true if Ollama is reachable AND the target model is listed. */
  async isModelAvailable(): Promise<boolean> {
    const verification = await this.verifyModelLoaded({ warmup: false });
    return verification.loaded;
  }

  /**
   * Verifies the configured model is listed and optionally warms it up
   * with a test embedding (confirms the model can actually produce vectors).
   */
  async verifyModelLoaded(opts: { warmup?: boolean } = {}): Promise<ModelVerificationResult> {
    const warmup = opts.warmup ?? true;
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return { loaded: false };

      const json = (await res.json()) as { models?: { name: string; size?: number; digest?: string }[] };
      const models = json.models ?? [];
      const baseName = this.model.split(':')[0] ?? this.model;
      const targetModel = models.find(
        (m) => m.name === this.model || m.name.startsWith(`${baseName}:`) || m.name.startsWith(baseName),
      );

      if (!targetModel) return { loaded: false };

      if (!warmup) {
        return {
          loaded: true,
          modelInfo: { name: targetModel.name, size: targetModel.size, digest: targetModel.digest },
        };
      }

      const vectors = await this.embed(['warmup test'], { timeoutMs: 180_000 });
      const dimensions = vectors[0]?.length;

      return {
        loaded: true,
        modelInfo: {
          name: targetModel.name,
          size: targetModel.size,
          digest: targetModel.digest,
          dimensions,
        },
      };
    } catch {
      return { loaded: false };
    }
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const start = Date.now();
    const verification = await this.verifyModelLoaded({ warmup: true });
    if (!verification.loaded) return { healthy: false, latencyMs: -1 };
    return { healthy: true, latencyMs: Date.now() - start };
  }

  async getCapabilities(): Promise<BackendCapabilities> {
    const modelCheck = await this.verifyModelLoaded({ warmup: false });
    const dimensions = modelCheck.modelInfo?.dimensions ?? 1024;

    return {
      name: 'ollama',
      model: this.model,
      available: modelCheck.loaded,
      gpuAccelerated: true,
      maxBatchSize: this.batchSize,
      dimensions,
      estimatedThroughput: modelCheck.loaded ? '~500 chunks/min' : 'unavailable',
    };
  }
}
