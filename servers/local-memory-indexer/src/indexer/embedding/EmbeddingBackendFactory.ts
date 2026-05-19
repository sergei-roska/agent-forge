import { getConfig } from '../../config.js';
import { IndexerError, ErrorCode } from '../../errors/codes.js';
import { OllamaBackend } from './backends/OllamaBackend.js';
import { TransformersJsBackend } from './backends/TransformersJsBackend.js';
import type { EmbeddingBackend } from './EmbeddingBackend.js';

export type BackendOption = 'ollama' | 'transformers_js' | 'auto';

export interface BackendFactoryOptions {
  backend?: BackendOption;
  batchSize?: number;
}

/**
 * Creates the active embedding backend.
 *
 * Selection order:
 *   1. Explicit `backend` parameter.
 *   2. Auto: Ollama reachable + model available → OllamaBackend.
 *   3. Auto: fallback → TransformersJsBackend.
 *
 * Throws EMBEDDING_BACKEND_UNAVAILABLE if the requested backend is
 * explicitly set but not reachable.
 */
export async function createEmbeddingBackend(
  opts: BackendFactoryOptions = {},
): Promise<EmbeddingBackend> {
  const cfg = getConfig();
  const choice = opts.backend ?? 'auto';

  if (choice === 'ollama') {
    const be = new OllamaBackend(cfg.embedModel, cfg.ollamaBaseUrl, opts.batchSize);
    if (!(await be.healthCheck())) {
      throw new IndexerError(
        ErrorCode.EMBEDDING_BACKEND_UNAVAILABLE,
        `Ollama is not reachable at ${cfg.ollamaBaseUrl}. Ensure Ollama is running.`,
        { backend: 'ollama', url: cfg.ollamaBaseUrl },
      );
    }
    return be;
  }

  if (choice === 'transformers_js') {
    const be = new TransformersJsBackend(undefined, opts.batchSize);
    if (!(await be.healthCheck())) {
      throw new IndexerError(
        ErrorCode.EMBEDDING_BACKEND_UNAVAILABLE,
        'TransformersJS pipeline failed to load. Ensure @xenova/transformers is installed.',
        { backend: 'transformers_js' },
      );
    }
    return be;
  }

  // auto: try Ollama first
  const ollama = new OllamaBackend(cfg.embedModel, cfg.ollamaBaseUrl, opts.batchSize);
  if (await ollama.isModelAvailable()) {
    return ollama;
  }

  // fallback to TransformersJS — don't health-check here to avoid blocking
  // startup with a slow model download; the consumer will catch errors.
  return new TransformersJsBackend(undefined, opts.batchSize);
}

/**
 * Embeds a single probe text and returns the vector dimension.
 * Used to configure the LanceDB schema before the first write.
 */
export async function probeVectorDim(backend: EmbeddingBackend): Promise<number> {
  const vectors = await backend.embed(['probe']);
  const dim = vectors[0]?.length;
  if (!dim) throw new Error('Embedding backend returned empty vector on probe');
  return dim;
}
