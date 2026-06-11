import { getConfig } from '../config.js';
import type { ScoredResult } from './types.js';

/**
 * Optional LLM re-rank via qwen3.5:9b on Ollama (Spec 08.2 §2.3 step 6).
 *
 * Sends the top-N (≤20) candidates and asks for a re-ordered index list. If
 * Ollama is unreachable or the response is unusable, returns `applied: false`
 * and the original order — the caller emits the `rerank_unavailable` warning.
 */
export interface RerankOutcome {
  results: ScoredResult[];
  applied: boolean;
}

export async function rerankWithLlm(
  query: string,
  results: ScoredResult[],
  maxCandidates = 20,
): Promise<RerankOutcome> {
  if (results.length <= 1) return { results, applied: false };

  const cfg = getConfig();
  const candidates = results.slice(0, Math.min(maxCandidates, results.length));

  const numbered = candidates
    .map((r, i) => {
      const snippet = (r.row.text ?? r.row.raw_text ?? '').slice(0, 400).replace(/\s+/g, ' ');
      return `[${i}] ${r.row.file_path} (${r.row.function_name ?? r.row.class_name ?? 'top-level'}): ${snippet}`;
    })
    .join('\n');

  const prompt =
    `You are re-ranking code/document search results for the query: "${query}".\n` +
    `Below are ${candidates.length} candidates, each prefixed with an index.\n` +
    `Return ONLY a JSON array of the candidate indices ordered from most to least relevant. ` +
    `Include every index exactly once. No prose.\n\n${numbered}`;

  try {
    const res = await fetch(`${cfg.ollamaBaseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: cfg.rerankModel,
        prompt,
        stream: false,
        options: { temperature: 0 },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return { results, applied: false };

    const json = (await res.json()) as { response?: string };
    const order = parseOrder(json.response ?? '', candidates.length);
    if (!order) return { results, applied: false };

    const reordered = order.map((idx) => candidates[idx]!);
    // Preserve any tail beyond the reranked window.
    const tail = results.slice(candidates.length);
    return { results: [...reordered, ...tail], applied: true };
  } catch {
    return { results, applied: false };
  }
}

function parseOrder(text: string, n: number): number[] | null {
  const match = text.match(/\[[\s\S]*?\]/);
  if (!match) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const order = parsed.map((x) => Number(x)).filter((x) => Number.isInteger(x) && x >= 0 && x < n);
  // Must be a valid permutation of [0, n).
  if (new Set(order).size !== n) return null;
  return order;
}
