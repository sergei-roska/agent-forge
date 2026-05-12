import { DEFAULT_EMBED_MODEL, DEFAULT_ENRICH_MODEL, DEFAULT_RERANK_MODEL } from '../config.js';
import type { EmbedResult, EnrichmentResult, RerankResult, SearchResult } from '../types.js';
import { normalizeVector, tokenize, uniqueStrings } from '../utils.js';

interface OllamaChatResponse {
  message?: {
    content?: string;
  };
  response?: string;
}

export class OllamaClient {
  constructor(private readonly baseUrl: string) {}

  async health(): Promise<{ ok: boolean; models: string[]; warning?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) {
        return { ok: false, models: [], warning: `HTTP ${response.status}` };
      }
      const payload = await response.json() as { models?: Array<{ name?: string }> };
      return {
        ok: true,
        models: (payload.models ?? []).map((model) => model.name).filter((name): name is string => Boolean(name)),
      };
    } catch (error) {
      return {
        ok: false,
        models: [],
        warning: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async embed(inputs: string[], model: string = DEFAULT_EMBED_MODEL): Promise<EmbedResult> {
    const warnings: string[] = [];
    try {
      const response = await fetch(`${this.baseUrl}/api/embed`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          input: inputs,
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama embed failed with HTTP ${response.status}`);
      }

      const payload = await response.json() as {
        embeddings?: number[][];
        embedding?: number[];
      };

      const vectors = payload.embeddings
        ?? (payload.embedding ? [payload.embedding] : undefined);

      if (!vectors || vectors.length !== inputs.length) {
        throw new Error('Ollama embed response did not return the expected number of vectors.');
      }

      return {
        vectors: vectors.map((vector) => normalizeVector(vector)),
        model,
        backend: 'ollama',
        warnings,
      };
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error));
      return {
        vectors: inputs.map((input) => deterministicHashEmbedding(input)),
        model: 'local-hash-v1',
        backend: 'local-hash',
        warnings,
      };
    }
  }

  async enrichChunk(text: string, filePath: string, language: string, model: string = DEFAULT_ENRICH_MODEL): Promise<EnrichmentResult> {
    const warnings: string[] = [];
    const fallback = fallbackEnrichment(text, filePath, language);
    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          stream: false,
          format: 'json',
          options: {
            temperature: 0,
          },
          messages: [
            {
              role: 'system',
              content: 'Return strict JSON with keys summary:string and tags:string[]. Keep summary under 180 chars. Use lowercase tags.',
            },
            {
              role: 'user',
              content: `File: ${filePath}\nLanguage: ${language}\n\nChunk:\n${text.slice(0, 6000)}`,
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama enrich failed with HTTP ${response.status}`);
      }

      const payload = await response.json() as OllamaChatResponse;
      const content = payload.message?.content ?? payload.response ?? '';
      const parsed = JSON.parse(content) as { summary?: string; tags?: string[] };
      return {
        summary: parsed.summary?.trim() || fallback.summary,
        tags: uniqueStrings((parsed.tags ?? []).map((tag) => tag.toLowerCase())),
        backend: 'ollama',
        warnings,
      };
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error));
      return {
        ...fallback,
        backend: 'fallback',
        warnings,
      };
    }
  }

  async rerank(query: string, results: SearchResult[], model: string = DEFAULT_RERANK_MODEL): Promise<RerankResult> {
    const warnings: string[] = [];
    if (results.length <= 1) {
      return {
        orderedChunkIds: results.map((result) => result.chunkId),
        backend: 'noop',
        warnings,
      };
    }

    const candidates = results.slice(0, 12).map((result, index) => ({
      id: result.chunkId,
      rank: index + 1,
      file_path: result.filePath,
      summary: result.summary,
      tags: result.tags,
      excerpt: result.excerpt.slice(0, 500),
    }));

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          stream: false,
          format: 'json',
          options: {
            temperature: 0,
          },
          messages: [
            {
              role: 'system',
              content: 'Return strict JSON with key ordered_chunk_ids:string[]. Preserve only ids from the input.',
            },
            {
              role: 'user',
              content: JSON.stringify({
                query,
                candidates,
              }),
            },
          ],
        }),
      });
      if (!response.ok) {
        throw new Error(`Ollama rerank failed with HTTP ${response.status}`);
      }
      const payload = await response.json() as OllamaChatResponse;
      const content = payload.message?.content ?? payload.response ?? '';
      const parsed = JSON.parse(content) as { ordered_chunk_ids?: string[] };
      const orderedChunkIds = (parsed.ordered_chunk_ids ?? []).filter((id) => candidates.some((candidate) => candidate.id === id));
      const remainder = results.map((result) => result.chunkId).filter((id) => !orderedChunkIds.includes(id));
      return {
        orderedChunkIds: [...orderedChunkIds, ...remainder],
        backend: 'ollama',
        warnings,
      };
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error));
      return {
        orderedChunkIds: results
          .slice()
          .sort((left, right) => right.hybridScore - left.hybridScore)
          .map((result) => result.chunkId),
        backend: 'fallback',
        warnings,
      };
    }
  }
}

function deterministicHashEmbedding(input: string, dimensions: number = 256): number[] {
  const vector = new Array<number>(dimensions).fill(0);
  const tokens = tokenize(input);
  for (const token of tokens) {
    let hash = 2166136261;
    for (let index = 0; index < token.length; index += 1) {
      hash ^= token.charCodeAt(index);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    const bucket = Math.abs(hash) % dimensions;
    vector[bucket] += 1;
  }
  return normalizeVector(vector);
}

function fallbackEnrichment(text: string, filePath: string, language: string): Pick<EnrichmentResult, 'summary' | 'tags'> {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const firstMeaningfulLine = lines.find((line) => line.length > 8) ?? lines[0] ?? '';
  const tags = uniqueStrings([
    language,
    ...tokenize(filePath).filter((token) => token.length > 2).slice(0, 3),
    ...tokenize(text).filter((token) => token.length > 4).slice(0, 5),
  ]).slice(0, 8);

  return {
    summary: firstMeaningfulLine.slice(0, 180) || `Chunk from ${filePath}`,
    tags,
  };
}
