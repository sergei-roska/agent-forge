import { getConfig } from '../../config.js';
import { IndexerError, ErrorCode } from '../../errors/codes.js';
import { OllamaBackend } from './backends/OllamaBackend.js';
import { TransformersJsBackend } from './backends/TransformersJsBackend.js';
import type { EmbeddingBackend } from './EmbeddingBackend.js';
import { rootLogger } from '../../observability/logger.js';

export type BackendOption = 'ollama' | 'transformers_js' | 'auto';

export interface BackendFactoryOptions {
  backend?: BackendOption;
  batchSize?: number;
}

const log = rootLogger.child({ component: 'EmbeddingBackendFactory' });

/**
 * Returns the recommended batch size for a given backend type.
 * Smaller first batches improve time-to-first-result and reduce
 * memory pressure during initial model load.
 */
export function getOptimalBatchSize(backendName: 'ollama' | 'transformers_js'): number {
  switch (backendName) {
    case 'ollama':          return 50;
    case 'transformers_js': return 25; // CPU memory constrained
  }
}

/**
 * Creates the active embedding backend.
 *
 * Selection order:
 *   1. Explicit `backend` parameter.
 *   2. Auto: Ollama reachable + model available → OllamaBackend (health-checked).
 *   3. Auto: fallback → TransformersJsBackend (health-checked).
 *
 * Throws EMBEDDING_BACKEND_UNAVAILABLE if the requested backend is
 * explicitly set but not reachable, or if auto mode finds no healthy backend.
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
        `Ollama is not reachable at ${cfg.ollamaBaseUrl}. Ensure Ollama is running.`,
        { backend: 'ollama', url: cfg.ollamaBaseUrl },
      );
    }
    log.info('ollama backend selected (explicit)', { latencyMs: health.latencyMs });
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
    log.info('transformers_js backend selected (explicit)', { latencyMs: health.latencyMs });
    return be;
  }

  // ── auto: try Ollama first ──────────────────────────────────────────────────
  const batchSizeOllama = opts.batchSize ?? getOptimalBatchSize('ollama');
  const ollama = new OllamaBackend(cfg.embedModel, cfg.ollamaBaseUrl, batchSizeOllama);

  if (await ollama.isModelAvailable()) {
    const health = await ollama.healthCheck();
    if (health.healthy) {
      log.info('ollama backend selected (auto)', { latencyMs: health.latencyMs, model: cfg.embedModel });
      return ollama;
    }
    log.warn('ollama model listed but health check failed, falling back to transformers_js');
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
      'No healthy embedding backend available. Ollama unreachable and @xenova/transformers pipeline failed to load.',
      { backend: 'auto' },
    );
  }
  log.info('transformers_js backend selected (auto fallback)', { latencyMs: tfjsHealth.latencyMs });
  return tfjs;
}

/**
 * Embeds a single probe text and returns the vector dimension.
 * Used to configure the LanceDB schema before the first write.
 */
export async function probeVectorDim(backend: EmbeddingBackend): Promise<number> {
  const vectors = await backend.embed(['probe'], { timeoutMs: 30_000 });
  const dim = vectors[0]?.length;
  if (!dim) throw new Error('Embedding backend returned empty vector on probe');
  return dim;
}
