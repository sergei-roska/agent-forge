import { getConfig } from '../../config.js';
import { IndexerError, ErrorCode } from '../../errors/codes.js';
import { OllamaBackend } from './backends/OllamaBackend.js';
import { TransformersJsBackend } from './backends/TransformersJsBackend.js';
import type { BackendCapabilities, EmbeddingBackend } from './EmbeddingBackend.js';
import { rootLogger } from '../../observability/logger.js';

export type BackendOption = 'ollama' | 'transformers_js' | 'auto';

export interface BackendFactoryOptions {
  backend?: BackendOption;
  batchSize?: number;
}

const log = rootLogger.child({ component: 'EmbeddingBackendFactory' });

function logSelectedBackend(caps: BackendCapabilities, latencyMs: number): void {
  log.info('embedding backend selected', {
    backend: caps.name,
    model: caps.model,
    gpuAccelerated: caps.gpuAccelerated,
    dimensions: caps.dimensions,
    maxBatchSize: caps.maxBatchSize,
    estimatedThroughput: caps.estimatedThroughput,
    latencyMs,
  });
}

/**
 * Returns the recommended batch size for a given backend type.
 */
export function getOptimalBatchSize(backendName: 'ollama' | 'transformers_js'): number {
  switch (backendName) {
    case 'ollama':          return 50;
    case 'transformers_js': return 25;
  }
}

/**
 * Creates the active embedding backend with health verification and capability reporting.
 */
export async function createEmbeddingBackend(
  opts: BackendFactoryOptions = {},
): Promise<EmbeddingBackend> {
  const cfg = getConfig();
  const choice = opts.backend ?? 'auto';

  if (choice === 'ollama') {
    const be = new OllamaBackend(cfg.embedModel, cfg.ollamaBaseUrl, opts.batchSize);
    const health = await be.healthCheck();
    if (!health.healthy) {
      throw new IndexerError(
        ErrorCode.EMBEDDING_BACKEND_UNAVAILABLE,
        `Ollama model "${cfg.embedModel}" is not available at ${cfg.ollamaBaseUrl}. Ensure Ollama is running and the model is pulled.`,
        { backend: 'ollama', url: cfg.ollamaBaseUrl, model: cfg.embedModel },
      );
    }
    const caps = await be.getCapabilities();
    logSelectedBackend(caps, health.latencyMs);
    return be;
  }

  if (choice === 'transformers_js') {
    const be = new TransformersJsBackend(undefined, opts.batchSize);
    const health = await be.healthCheck();
    if (!health.healthy) {
      throw new IndexerError(
        ErrorCode.EMBEDDING_BACKEND_UNAVAILABLE,
        'TransformersJS pipeline failed to load. Ensure @xenova/transformers is installed.',
        { backend: 'transformers_js' },
      );
    }
    const caps = await be.getCapabilities();
    logSelectedBackend(caps, health.latencyMs);
    return be;
  }

  // ── auto: try Ollama first ──────────────────────────────────────────────────
  const batchSizeOllama = opts.batchSize ?? getOptimalBatchSize('ollama');
  const ollama = new OllamaBackend(cfg.embedModel, cfg.ollamaBaseUrl, batchSizeOllama);

  const ollamaAvailable = await ollama.isModelAvailable();
  if (ollamaAvailable) {
    const health = await ollama.healthCheck();
    if (health.healthy) {
      const caps = await ollama.getCapabilities();
      logSelectedBackend(caps, health.latencyMs);
      return ollama;
    }
    log.warn('ollama model listed but health check failed, falling back to transformers_js', {
      model: cfg.embedModel,
    });
  } else {
    log.warn('ollama model not available, falling back to transformers_js', {
      model: cfg.embedModel,
      url: cfg.ollamaBaseUrl,
    });
  }

  // ── fallback: TransformersJS ────────────────────────────────────────────────
  const batchSizeTfjs = opts.batchSize ?? getOptimalBatchSize('transformers_js');
  const tfjs = new TransformersJsBackend(undefined, batchSizeTfjs);
  const tfjsHealth = await tfjs.healthCheck();
  if (!tfjsHealth.healthy) {
    throw new IndexerError(
      ErrorCode.EMBEDDING_BACKEND_UNAVAILABLE,
      'No healthy embedding backend available. Start Ollama with the embedding model pulled, or install @xenova/transformers.',
      { backend: 'auto' },
    );
  }
  const tfjsCaps = await tfjs.getCapabilities();
  logSelectedBackend(tfjsCaps, tfjsHealth.latencyMs);
  return tfjs;
}

/**
 * Probe backend capabilities without selecting it for a run.
 * Used by get_indexing_status to report GPU/throughput for the active backend.
 */
export async function probeBackendCapabilities(
  backendName: 'ollama' | 'transformers_js',
): Promise<BackendCapabilities | null> {
  try {
    const backend = await createEmbeddingBackend({ backend: backendName });
    return backend.getCapabilities();
  } catch {
    return null;
  }
}

/**
 * Embeds a single probe text and returns the vector dimension.
 */
export async function probeVectorDim(backend: EmbeddingBackend): Promise<number> {
  const vectors = await backend.embed(['probe'], { timeoutMs: 30_000 });
  const dim = vectors[0]?.length;
  if (!dim) throw new Error('Embedding backend returned empty vector on probe');
  return dim;
}
