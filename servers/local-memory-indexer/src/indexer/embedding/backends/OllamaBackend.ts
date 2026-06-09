import { DEFAULT_BATCH_SIZE_OLLAMA } from '../../../constants.js';
import type { EmbeddingBackend, EmbedOptions, HealthCheckResult } from '../EmbeddingBackend.js';

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
    const timeoutMs = opts?.timeoutMs ?? 60_000; // 60s per batch default
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

  async healthCheck(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return { healthy: false, latencyMs: -1 };
      const json = (await res.json()) as { models?: { name: string }[] };
      if (!Array.isArray(json.models)) return { healthy: false, latencyMs: -1 };
      // Accept if Ollama is reachable — model may still be loading
      return { healthy: true, latencyMs: Date.now() - start };
    } catch {
      return { healthy: false, latencyMs: -1 };
    }
  }

  /** Returns true if Ollama is reachable AND the target model is listed. */
  async isModelAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) return false;
      const json = (await res.json()) as { models?: { name: string }[] };
      const name = this.model.includes(':') ? this.model : `${this.model}:latest`;
      return json.models?.some((m) => m.name === name || m.name.startsWith(this.model)) ?? false;
    } catch {
      return false;
    }
  }
}
