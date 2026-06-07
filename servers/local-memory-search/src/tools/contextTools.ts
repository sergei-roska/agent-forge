import type { ToolDefinition } from '../mcp/runtime.js';
import type { SearchEngine } from '../search/SearchEngine.js';
import { ok, structuredError } from '../mcp/envelope.js';
import { ErrorCode } from '../errors/codes.js';
import {
  retrieveContextPackShape, RetrieveContextPackSchema,
  readChunkNeighborsShape, ReadChunkNeighborsSchema,
  getChunkShape, GetChunkSchema,
  searchSimilarShape, SearchSimilarSchema,
} from '../contracts/schemas.js';
import { validateProject, buildSearchResponse } from './shared.js';
import { buildContextPack } from '../search/contextPack.js';
import { getNeighbors } from '../search/neighbors.js';
import { buildWherePredicate } from '../storage/filters.js';
import { truncateText } from '../search/projection.js';
import { DEFAULT_TOP_K_CANDIDATES } from '../constants.js';
import type { ChunkRow } from '../search/types.js';

function chunkView(row: ChunkRow, maxChars: number) {
  const text = row.text ?? row.raw_text ?? '';
  return {
    chunk_id: row.chunk_id,
    file_path: row.file_path,
    start_line: row.start_line,
    end_line: row.end_line,
    text: maxChars > 0 ? truncateText(text, maxChars, 'middle') : text,
  };
}

export function makeRetrieveContextPackTool(engine: SearchEngine): ToolDefinition {
  return {
    name: 'retrieve_context_pack',
    description:
      'Return an agent-ready, token-budgeted context package for the top relevant files and chunks. Includes optional neighbor chunk expansion and LLM re-ranking.',
    inputSchema: retrieveContextPackShape,
    handler: async (raw) => {
      const parsed = RetrieveContextPackSchema.safeParse(raw);
      if (!parsed.success) return structuredError(ErrorCode.PATH_TRAVERSAL, parsed.error.issues[0]?.message ?? 'Invalid input.');
      const a = parsed.data;
      const proj = validateProject(a.project_path);
      if ('error' in proj) return proj.error;

      const pack = await buildContextPack(engine, {
        query: a.query, projectPath: proj.path,
        maxFiles: a.max_files, maxChars: a.max_chars,
        includeNeighbors: a.include_neighbors, neighborHops: a.neighbor_hops,
        rerank: a.rerank, truncateStrategy: a.truncate_strategy,
        alpha: a.alpha, filters: a.filters,
      });

      const summary = pack.empty
        ? `No indexed content matched the query for project '${proj.path}'.`
        : `Context pack: ${pack.excerpts.length} excerpt${pack.excerpts.length === 1 ? '' : 's'} from ` +
          `${pack.files.length} file${pack.files.length === 1 ? '' : 's'}, ` +
          `${pack.budget.used_chars}/${pack.budget.max_chars} chars used` +
          `${pack.budget.truncated ? ' (truncated)' : ''}${pack.rerank_applied ? ', LLM-reranked' : ''}.`;

      return ok(
        summary,
        {
          files: pack.files,
          excerpts: pack.excerpts,
          budget: pack.budget,
          rerank_applied: pack.rerank_applied,
        },
        {
          warnings: pack.warnings.length ? pack.warnings : undefined,
          next_steps: pack.empty ? `Run start_indexing with project_path '${proj.path}' to build the index.` : undefined,
        },
      );
    },
  };
}

export function makeReadChunkNeighborsTool(engine: SearchEngine): ToolDefinition {
  return {
    name: 'read_chunk_neighbors',
    description:
      'Retrieve the N chunks immediately before and after a given chunk within the same file. Enables context expansion around a search hit.',
    inputSchema: readChunkNeighborsShape,
    handler: async (raw) => {
      const parsed = ReadChunkNeighborsSchema.safeParse(raw);
      if (!parsed.success) return structuredError(ErrorCode.CHUNK_NOT_FOUND, parsed.error.issues[0]?.message ?? 'Invalid input.');
      const a = parsed.data;
      const proj = validateProject(a.project_path);
      if ('error' in proj) return proj.error;

      const nb = await getNeighbors(engine, proj.path, a.chunk_id, a.before, a.after);
      if (!nb.target) {
        return structuredError(
          ErrorCode.CHUNK_NOT_FOUND,
          `chunk_id '${a.chunk_id}' not found in the current index. It may have been re-indexed.`,
          { suggestion: 'Re-run the search to obtain fresh chunk_ids.' },
        );
      }

      return ok(
        `Returned ${nb.before.length} preceding and ${nb.after.length} following chunk(s) for ${nb.target.file_path}.`,
        {
          target_chunk: chunkView(nb.target, 0),
          neighbors: {
            before: nb.before.map((c) => chunkView(c, 0)),
            after: nb.after.map((c) => chunkView(c, 0)),
          },
        },
        { warnings: nb.warnings.length ? nb.warnings : undefined },
      );
    },
  };
}

export function makeGetChunkTool(engine: SearchEngine): ToolDefinition {
  return {
    name: 'get_chunk',
    description: 'Fetch one indexed chunk by its stable chunk_id.',
    inputSchema: getChunkShape,
    handler: async (raw) => {
      const parsed = GetChunkSchema.safeParse(raw);
      if (!parsed.success) return structuredError(ErrorCode.CHUNK_NOT_FOUND, parsed.error.issues[0]?.message ?? 'Invalid input.');
      const a = parsed.data;
      const proj = validateProject(a.project_path);
      if ('error' in proj) return proj.error;

      const where = buildWherePredicate(proj.path);
      const lance = await engine.lance(proj.path);
      let row: ChunkRow | null = lance ? await lance.getByChunkId(a.chunk_id, where) : null;
      if (!row) {
        const sqlite = engine.sqlite(proj.path);
        row = sqlite?.getChunkById(proj.path, a.chunk_id) ?? null;
      }
      if (!row) {
        return structuredError(
          ErrorCode.CHUNK_NOT_FOUND,
          `chunk_id '${a.chunk_id}' not found in the current index. It may have been re-indexed.`,
          { suggestion: 'Re-run the search to obtain fresh chunk_ids.' },
        );
      }

      const full = {
        chunk_id: row.chunk_id,
        file_path: row.file_path,
        start_line: row.start_line,
        end_line: row.end_line,
        text: a.max_chars > 0 ? truncateText(row.text ?? row.raw_text ?? '', a.max_chars, 'middle') : (row.text ?? row.raw_text ?? ''),
        language: row.language,
        function_name: row.function_name,
        class_name: row.class_name,
        symbol_path: row.symbol_path ?? null,
        tags: row.tags ?? null,
        mtime_ns: row.mtime_ns,
        last_commit_hash: row.last_commit_hash ?? null,
      };
      const data = a.fields?.length
        ? Object.fromEntries(Object.entries(full).filter(([k]) => a.fields!.includes(k)))
        : full;

      return ok(`Chunk ${row.chunk_id} from ${row.file_path}.`, data);
    },
  };
}

export function makeSearchSimilarTool(engine: SearchEngine): ToolDefinition {
  return {
    name: 'search_similar',
    description:
      'Find code chunks similar to a specific file (optionally a specific function) via vector ANN on its stored embedding.',
    inputSchema: searchSimilarShape,
    handler: async (raw) => {
      const parsed = SearchSimilarSchema.safeParse(raw);
      if (!parsed.success) return structuredError(ErrorCode.PATH_TRAVERSAL, parsed.error.issues[0]?.message ?? 'Invalid input.');
      const a = parsed.data;
      const proj = validateProject(a.project_path);
      if ('error' in proj) return proj.error;

      const lance = await engine.lance(proj.path);
      if (!lance) {
        return structuredError(
          ErrorCode.INDEX_UNAVAILABLE,
          'search_similar requires the vector index, which is unavailable.',
          { suggestion: 'Run start_indexing, or use search_keyword for a text-based fallback.' },
        );
      }

      // Locate a seed chunk for the file (+ optional function), read its vector.
      const seedRows = await lance.chunksByFile(
        buildWherePredicate(proj.path), a.file_path, a.function_name, 200,
      );
      const seed = seedRows[0] ?? null;
      if (!seed) {
        return structuredError(
          ErrorCode.CHUNK_NOT_FOUND,
          `No indexed chunk found for file '${a.file_path}'${a.function_name ? ` function '${a.function_name}'` : ''}.`,
        );
      }
      const vector = await lance.getVectorByChunkId(seed.chunk_id, buildWherePredicate(proj.path));
      if (!vector) {
        return structuredError(ErrorCode.CHUNK_NOT_FOUND, `Seed chunk '${seed.chunk_id}' has no stored vector.`);
      }

      const hits = await lance.vectorSearch(
        vector, buildWherePredicate(proj.path, a.filters), Math.max(DEFAULT_TOP_K_CANDIDATES, a.limit + 1),
      );
      const results = hits
        .filter((h) => h.row.chunk_id !== seed.chunk_id)
        .slice(0, a.limit)
        .map((h) => ({
          chunk_id: h.row.chunk_id,
          file_path: h.row.file_path,
          start_line: h.row.start_line,
          end_line: h.row.end_line,
          text: truncateText(h.row.text ?? h.row.raw_text ?? '', a.max_chars, 'middle'),
          language: h.row.language,
          function_name: h.row.function_name,
          class_name: h.row.class_name,
        }));

      return ok(
        `Found ${results.length} chunk(s) similar to ${seed.file_path}${a.function_name ? ` (${a.function_name})` : ''}.`,
        { seed: { chunk_id: seed.chunk_id, file_path: seed.file_path, function_name: seed.function_name }, results },
      );
    },
  };
}
