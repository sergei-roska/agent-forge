import type { ToolDefinition } from '../mcp/runtime.js';
import type { SearchEngine } from '../search/SearchEngine.js';
import { ok, structuredError } from '../mcp/envelope.js';
import { ErrorCode } from '../errors/codes.js';
import {
  healthCheckShape, HealthCheckSchema,
  indexStatusShape, IndexStatusSchema,
  doctorIndexShape, DoctorIndexSchema,
  explainMatchShape, ExplainMatchSchema,
} from '../contracts/schemas.js';
import { validateProject } from './shared.js';
import { buildWherePredicate } from '../storage/filters.js';
import { LanceReader } from '../storage/LanceReader.js';
import { SqliteReader } from '../storage/SqliteReader.js';
import { CONTRACT_VERSION, SCHEMA_VERSION, DEFAULT_TOP_K_CANDIDATES } from '../constants.js';

const startedAt = Date.now();

export function makeHealthCheckTool(engine: SearchEngine): ToolDefinition {
  return {
    name: 'health_check',
    description: 'Report search-service readiness: LanceDB access, embedding backend, FTS presence, schema_version, and partial-index capability flags (verbose=true).',
    inputSchema: healthCheckShape,
    handler: async (raw) => {
      const a = HealthCheckSchema.parse(raw);
      const proj = validateProject(a.project_path);
      if ('error' in proj) return proj.error;

      const lanceExists = LanceReader.exists(proj.path);
      const sqliteExists = SqliteReader.exists(proj.path);
      const lance = lanceExists ? await engine.lance(proj.path) : null;
      const sqlite = sqliteExists ? engine.sqlite(proj.path) : null;
      const embed = await engine.getEmbedder().probe();

      const warnings: string[] = [];
      if (!lanceExists) warnings.push('LanceDB index not found for this project.');
      if (!embed.available) warnings.push('Embedding backend unavailable; semantic search will degrade to keyword-only.');

      const status = lanceExists || sqliteExists ? (embed.available ? 'ready' : 'degraded') : 'uninitialized';

      const data: Record<string, unknown> = {
        status,
        version: CONTRACT_VERSION,
        schema_version: SCHEMA_VERSION,
        index_path: proj.path,
        lancedb_available: lance !== null,
        sqlite_available: sqliteExists,
        embedding_backend: embed.available ? embed.backend : null,
        uptime_seconds: Math.round((Date.now() - startedAt) / 1000),
      };

      if (a.verbose) {
        const compatibleVectors = lance
          ? await lance.count(buildWherePredicate(proj.path)).catch(() => 0)
          : 0;
        const stats = sqlite?.stats(proj.path);
        const pendingChunks = stats?.pending_chunks ?? 0;
        const indexedChunks = (stats?.embedded_chunks ?? 0) + pendingChunks;

        const capabilities = {
          semantic_search: compatibleVectors > 0,
          keyword_search: indexedChunks > 0,
          hybrid_search: compatibleVectors > 0 && indexedChunks > 0,
          context_pack: indexedChunks > 0,
        };

        data['indexed_chunks'] = compatibleVectors;
        data['schema_versions_present'] = await lance?.distinctSchemaVersions(proj.path).catch(() => []) ?? [];
        data['index_capabilities'] = capabilities;
        data['pending_chunks'] = pendingChunks;

        // Capability-aware warnings for the verbose path.
        if (!capabilities.semantic_search && indexedChunks > 0) {
          warnings.push(
            'SEMANTIC_SEARCH_UNAVAILABLE: No embedded vectors found. ' +
              'keyword_search and context_pack are available. ' +
              'Run start_indexing (Indexer service) to enable semantic_search.',
          );
        }
        if (!capabilities.keyword_search) {
          warnings.push('KEYWORD_SEARCH_UNAVAILABLE: No chunks indexed for this project. Run start_indexing first.');
        }
        if (pendingChunks > 0) {
          warnings.push(
            `EMBEDDING_IN_PROGRESS: ${pendingChunks} chunk(s) pending embedding. ` +
              'Search operates in partial mode; results will improve as embedding continues.',
          );
        }
      }

      return ok(`Search service ${status} for '${proj.path}'.`, data, { warnings: warnings.length ? warnings : undefined });
    },
  };
}

export function makeIndexStatusTool(engine: SearchEngine): ToolDefinition {
  return {
    name: 'index_status',
    description: 'Show indexed file/chunk counts, freshness, and current search capability flags for a project. Reads LanceDB + SQLite (read-only).',
    inputSchema: indexStatusShape,
    handler: async (raw) => {
      const a = IndexStatusSchema.parse(raw);
      const proj = validateProject(a.project_path);
      if ('error' in proj) return proj.error;

      const sqlite = engine.sqlite(proj.path);
      const lance = await engine.lance(proj.path);
      const stats = sqlite?.stats(proj.path);
      const compatibleVectors = lance ? await lance.count(buildWherePredicate(proj.path)).catch(() => 0) : 0;

      const indexedChunks = (stats?.embedded_chunks ?? 0) + (stats?.pending_chunks ?? 0);
      const pendingChunks = stats?.pending_chunks ?? 0;
      const embeddedChunks = stats?.embedded_chunks ?? 0;
      const staleRatio = stats && stats.vector_count > 0
        ? Math.max(0, (stats.vector_count - compatibleVectors) / stats.vector_count)
        : 0;

      // Probe FTS availability (chunks with text content, regardless of vector status).
      // fts_ready_chunks counts chunks that can serve keyword search right now.
      const ftsReadyChunks = sqlite ? sqlite.countChunksWithText(proj.path) : 0;

      // Capability flags: what search modes are usable right now.
      const capabilities = {
        /** True when ≥1 vector is embedded and schema-compatible. */
        semantic_search: compatibleVectors > 0,
        /** True when ≥1 chunk with text content exists (keyword/FTS or SQLite LIKE). */
        keyword_search: indexedChunks > 0,
        /** True when both legs are available. */
        hybrid_search: compatibleVectors > 0 && indexedChunks > 0,
        /** True when keyword_search is available (context pack builds from any search leg). */
        context_pack: indexedChunks > 0,
      };

      // Actionable hints when the index is partially embedded.
      const warnings: string[] = [];
      if (pendingChunks > 0 && embeddedChunks === 0) {
        warnings.push(
          `EMBEDDING_NOT_STARTED: ${pendingChunks} chunk(s) pending embedding. ` +
            'keyword_search and context_pack are available now; semantic_search and hybrid_search require embedding to complete. ' +
            'Run start_indexing (Indexer service) to begin embedding.',
        );
      } else if (pendingChunks > 0) {
        warnings.push(
          `EMBEDDING_IN_PROGRESS: ${pendingChunks} chunk(s) still pending. ` +
            `hybrid_search has ${compatibleVectors} vectors available now; all modes will improve as embedding continues.`,
        );
      }

      const data = {
        project_path: proj.path,
        indexed_files: stats?.indexed_files ?? 0,
        indexed_chunks: indexedChunks,
        embedded_chunks: embeddedChunks,
        pending_chunks: pendingChunks,
        compatible_vectors: compatibleVectors,
        declared_vector_count: stats?.vector_count ?? 0,
        fts_ready_chunks: ftsReadyChunks,
        last_indexed_at: stats?.last_indexed_at ?? null,
        stale_ratio: round(staleRatio),
        schema_version: SCHEMA_VERSION,
        capabilities,
      };

      const summary =
        `Project '${proj.path}': ${data.indexed_files} files, ${compatibleVectors} compatible vectors` +
        `${pendingChunks ? `, ${pendingChunks} pending embedding` : ''}. ` +
        `Modes available: ${Object.entries(capabilities)
          .filter(([, v]) => v)
          .map(([k]) => k)
          .join(', ') || 'none (no chunks indexed)'}.`;

      return ok(summary, data, { warnings: warnings.length ? warnings : undefined });
    },
  };
}

export function makeDoctorIndexTool(engine: SearchEngine): ToolDefinition {
  return {
    name: 'doctor_index',
    description:
      'Diagnose inconsistencies between LanceDB schema_version, the FTS index, and SQLite fingerprints. Read-only: returns suggested actions but never modifies the index.',
    inputSchema: doctorIndexShape,
    handler: async (raw) => {
      const a = DoctorIndexSchema.parse(raw);
      const proj = validateProject(a.project_path);
      if ('error' in proj) return proj.error;

      const checks: { name: string; ok: boolean; detail: string }[] = [];
      const issues: string[] = [];
      const suggested: string[] = [];

      const lance = await engine.lance(proj.path);
      const sqlite = engine.sqlite(proj.path);

      // 1. LanceDB reachable
      checks.push({ name: 'lancedb_reachable', ok: lance !== null, detail: lance ? 'open' : 'not found / unopenable' });
      if (!lance) {
        issues.push('LanceDB index unavailable.');
        suggested.push('Run start_indexing to build the vector index.');
      }

      // 2. SQLite state present
      checks.push({ name: 'sqlite_state_present', ok: sqlite !== null, detail: sqlite ? 'open (read-only)' : 'missing' });

      const where = buildWherePredicate(proj.path);

      // 3. Schema-version consistency
      if (lance) {
        const versions = await lance.distinctSchemaVersions(proj.path).catch(() => []);
        const stale = versions.filter((v) => v !== SCHEMA_VERSION);
        const consistent = stale.length === 0;
        checks.push({
          name: 'schema_version_consistent',
          ok: consistent,
          detail: consistent ? `all rows at '${SCHEMA_VERSION}'` : `stale versions present: ${JSON.stringify(stale)}`,
        });
        if (!consistent) {
          issues.push(`Stale schema versions found: ${stale.join(', ')}.`);
          suggested.push('Run delete_project_index then start_indexing with force=true (Indexer service).');
        }
      }

      // 4. FTS index presence (probe)
      if (lance) {
        let ftsOk = false;
        try {
          await lance.ftsSearch('probe', where, 1);
          ftsOk = true;
        } catch {
          ftsOk = false;
        }
        checks.push({ name: 'fts_index_present', ok: ftsOk, detail: ftsOk ? 'queryable' : 'missing — falling back to SQLite LIKE' });
        if (!ftsOk) {
          issues.push('FTS index missing; keyword search degrades to SQLite LIKE.');
          suggested.push('Trigger FTS index creation from the Indexer service (read-only service cannot build it).');
        }
      }

      // 5. Vector-count drift
      if (lance && sqlite) {
        const declared = sqlite.stats(proj.path).vector_count;
        const compatible = await lance.count(where).catch(() => 0);
        const drift = declared > 0 ? Math.abs(declared - compatible) / declared : 0;
        checks.push({
          name: 'vector_count_consistent',
          ok: drift <= 0.1,
          detail: `declared=${declared}, compatible=${compatible}, drift=${round(drift)}`,
        });
        if (drift > 0.1) {
          issues.push(`Vector-count drift ${Math.round(drift * 100)}% between SQLite stats and LanceDB.`);
          suggested.push('Re-run start_indexing to reconcile counts.');
        }
      }

      const healthy = issues.length === 0;
      return ok(
        healthy ? `Index healthy for '${proj.path}' (${checks.length} checks passed).`
                : `${issues.length} issue(s) found for '${proj.path}'.`,
        { healthy, checks, issues, auto_fixed: [], suggested_actions: suggested, note: a.auto_fix ? 'auto_fix ignored: search service is read-only.' : undefined },
      );
    },
  };
}

export function makeExplainMatchTool(engine: SearchEngine): ToolDefinition {
  return {
    name: 'explain_match',
    description: 'Explain why a chunk matched: vector score, FTS score, identifier-boost hits, and recency boost.',
    inputSchema: explainMatchShape,
    handler: async (raw) => {
      const parsed = ExplainMatchSchema.safeParse(raw);
      if (!parsed.success) return structuredError(ErrorCode.CHUNK_NOT_FOUND, parsed.error.issues[0]?.message ?? 'Invalid input.');
      const a = parsed.data;
      const proj = validateProject(a.project_path);
      if ('error' in proj) return proj.error;

      // Re-run retrieval WITHOUT gap filtering so the target is reachable.
      const outcome = await engine.retrieve({
        query: a.query, projectPath: proj.path,
        alpha: a.alpha, rrfK: 60, recencyWeight: 0.1, gapThreshold: 0,
        topK: DEFAULT_TOP_K_CANDIDATES, legs: 'hybrid', cacheBust: true,
      });

      const idx = outcome.results.findIndex((r) => r.row.chunk_id === a.result_id);
      if (idx < 0) {
        return structuredError(
          ErrorCode.CHUNK_NOT_FOUND,
          `result_id '${a.result_id}' was not among the candidates for this query.`,
          { suggestion: 'Run the same query via search_hybrid first, then explain a returned chunk_id.' },
        );
      }
      const r = outcome.results[idx]!;

      const breakdown = {
        final_score: round(r.score),
        rank: idx + 1,
        score_breakdown: {
          rrf_vector_component: round(r.score_vector),
          rrf_fts_component: round(r.score_fts),
          rank_vector: r.rank_vector,
          rank_fts: r.rank_fts,
          identifier_boost: round(r.identifier_boost),
          recency_multiplier: round(r.recency_multiplier),
        },
        mode: outcome.stats.mode,
        alpha: outcome.stats.alpha,
      };

      const detail = a.verbosity === 'full'
        ? { ...breakdown, file_path: r.row.file_path, start_line: r.row.start_line, end_line: r.row.end_line, text: r.row.text ?? r.row.raw_text ?? '' }
        : breakdown;

      return ok(
        `Chunk ${a.result_id} ranked #${idx + 1} (score ${round(r.score)}) via ${outcome.stats.mode}.`,
        detail,
        { warnings: outcome.stats.warnings.length ? outcome.stats.warnings : undefined },
      );
    },
  };
}

function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
