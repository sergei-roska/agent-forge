import { LanceReader, type RawHit } from '../storage/LanceReader.js';
import { SqliteReader } from '../storage/SqliteReader.js';
import { buildWherePredicate } from '../storage/filters.js';
import { QueryEmbedder } from '../embedding/QueryEmbedder.js';
import { normalizeQuery } from './normalize.js';
import { fuseRrf } from './rrf.js';
import { applyRecencyBoost } from './recency.js';
import { applyGapFilter } from './gapFilter.js';
import { ResultCache } from './resultCache.js';
import type { ScoredResult, PipelineStats, MetadataFilters, ChunkRow } from './types.js';
import type { SearchMode } from '../mcp/envelope.js';
import { isLockError } from '../errors/retry.js';
import { ErrorCode, Warn } from '../errors/codes.js';
import {
  DEFAULT_TOP_K_CANDIDATES,
  SCHEMA_MISMATCH_WARN_RATIO,
  SCHEMA_VERSION,
} from '../constants.js';
import { rootLogger } from '../observability/logger.js';

export type RetrievalLegs = 'hybrid' | 'semantic' | 'keyword';

export interface RetrieveParams {
  query: string;
  projectPath: string;
  alpha: number;
  rrfK: number;
  recencyWeight: number;
  gapThreshold: number;
  topK?: number;
  filters?: MetadataFilters;
  legs: RetrievalLegs;
  cacheBust?: boolean;
}

export interface RetrieveOutcome {
  /** Fused, recency-boosted, gap-filtered results (not yet paginated/projected). */
  results: ScoredResult[];
  stats: PipelineStats;
  /** True if the index exists but contains zero matching rows. */
  empty: boolean;
}

/**
 * The read-only query pipeline (Spec 08.2 §2.3). Owns short-lived reader handles
 * and the result cache. One instance is shared across all tools for the lifetime
 * of the MCP process.
 */
/** Minimal embedder contract — lets tests inject a deterministic encoder. */
export interface QueryEmbedderLike {
  embed(query: string): Promise<{ vector: number[]; backend: 'ollama' | 'transformers_js' }>;
  probe(): Promise<{ available: boolean; backend?: 'ollama' | 'transformers_js' }>;
}

export class SearchEngine {
  private readonly lanceCache = new Map<string, LanceReader | null>();
  private readonly sqliteCache = new Map<string, SqliteReader | null>();
  private readonly embedder: QueryEmbedderLike;
  readonly cache = new ResultCache<RetrieveOutcome>();

  constructor(embedder?: QueryEmbedderLike) {
    this.embedder = embedder ?? new QueryEmbedder();
  }

  async lance(projectPath: string): Promise<LanceReader | null> {
    if (!this.lanceCache.has(projectPath)) {
      const reader = await LanceReader.open(projectPath);
      if (reader) this.lanceCache.set(projectPath, reader);
      return reader;
    }
    const reader = this.lanceCache.get(projectPath) ?? null;
    if (reader) {
      await reader.refresh();
    }
    return reader;
  }

  /** Open (and memoize) a read-only SQLite handle for the project. */
  sqlite(projectPath: string): SqliteReader | null {
    if (!this.sqliteCache.has(projectPath)) {
      const reader = SqliteReader.open(projectPath);
      if (reader) this.sqliteCache.set(projectPath, reader);
      return reader;
    }
    return this.sqliteCache.get(projectPath) ?? null;
  }

  getEmbedder(): QueryEmbedderLike {
    return this.embedder;
  }

  /** Release cached handles (tests / shutdown). */
  close(): void {
    for (const r of this.sqliteCache.values()) r?.close();
    this.sqliteCache.clear();
    this.lanceCache.clear();
  }

  async retrieve(params: RetrieveParams): Promise<RetrieveOutcome> {
    const topK = params.topK ?? DEFAULT_TOP_K_CANDIDATES;
    const log = rootLogger.child({ tool: 'retrieve', project_path: params.projectPath });

    // Cache lookup (Spec 08.2 §3.2) — deterministic pagination within 60s.
    const cacheKey = ResultCache.key({
      projectPath: params.projectPath,
      query: params.query,
      filters: params.filters ?? null,
      alpha: params.alpha,
      limit: topK,
      legs: params.legs,
      rrfK: params.rrfK,
      recencyWeight: params.recencyWeight,
      gapThreshold: params.gapThreshold,
    });
    if (!params.cacheBust) {
      const cached = this.cache.get(cacheKey);
      if (cached) return cached;
    }

    const where = buildWherePredicate(params.projectPath, params.filters);
    const normalized = normalizeQuery(params.query);
    const warnings: string[] = [];

    const lance = await this.lance(params.projectPath);
    const sqlite = this.sqlite(params.projectPath);

    let vectorCount = 0;
    if (sqlite) {
      const stats = sqlite.stats(params.projectPath);
      vectorCount = stats.vector_count;
      if (stats.pending_chunks > 0) {
        warnings.push(
          `EMBEDDING_IN_PROGRESS: ${stats.pending_chunks} chunk(s) pending embedding. ` +
            'Keyword/hybrid search operates in partial mode; results will improve as embedding continues.',
        );
      }
    }

    let outcome: RetrieveOutcome;
    if (!lance) {
      // §5.4 INDEX_UNAVAILABLE — SQLite keyword fallback.
      outcome = this.sqliteFallback(sqlite, params, normalized.terms, warnings, topK);
    } else {
      outcome = await this.lanceRetrieve(lance, sqlite, params, normalized, where, warnings, topK, vectorCount);
    }

    log.info('retrieve complete', {
      mode: outcome.stats.mode,
      result_count: outcome.results.length,
      warnings_count: outcome.stats.warnings.length,
    });

    this.cache.set(cacheKey, outcome);
    return outcome;
  }

  // ── SQLite-only fallback (no LanceDB) ──────────────────────────────────────
  private sqliteFallback(
    sqlite: SqliteReader | null,
    params: RetrieveParams,
    terms: string[],
    warnings: string[],
    topK: number,
  ): RetrieveOutcome {
    warnings.push(Warn.lancedbConnectFailed);
    if (!sqlite) {
      return {
        results: [],
        stats: {
          mode: 'sqlite_fallback', alpha: 0, rrf_k: params.rrfK,
          warnings, gap_cutoff_applied: false, candidate_count: 0,
        },
        empty: true,
      };
    }
    const hits = sqlite.ftsFallback(params.projectPath, terms, topK);
    const results = this.scoredFromSqlite(hits);
    const gapped = applyGapFilter(results, params.gapThreshold);
    return {
      results: gapped.results,
      stats: {
        mode: 'sqlite_fallback', alpha: 0, rrf_k: params.rrfK,
        warnings, gap_cutoff_applied: gapped.applied, candidate_count: results.length,
      },
      empty: results.length === 0,
    };
  }

  // ── LanceDB retrieval with degradation cascade ─────────────────────────────
  private async lanceRetrieve(
    lance: LanceReader,
    sqlite: SqliteReader | null,
    params: RetrieveParams,
    normalized: ReturnType<typeof normalizeQuery>,
    where: string,
    warnings: string[],
    topK: number,
    vectorCount: number,
  ): Promise<RetrieveOutcome> {
    // Empty-index check (§5.3).
    let total = 0;
    try {
      total = await lance.count(where);
    } catch {
      total = 0;
    }
    if (total === 0) {
      // Distinguish "no rows for project" from "rows excluded by schema filter".
      await this.maybeWarnSchemaMismatch(lance, vectorCount, params.projectPath, where, warnings);
      const emptyMode: SearchMode = warnings.some((w) => w.startsWith('schema_version_mismatch'))
        ? 'keyword_only'
        : 'hybrid';
      return {
        results: [],
        stats: {
          mode: emptyMode, alpha: params.alpha, rrf_k: params.rrfK,
          warnings, gap_cutoff_applied: false, candidate_count: 0,
        },
        empty: true,
      };
    }

    await this.maybeWarnSchemaMismatch(lance, vectorCount, params.projectPath, where, warnings, total);

    let effectiveAlpha = params.alpha;
    const wantVector = params.legs !== 'keyword' && effectiveAlpha > 0;
    const wantFts = params.legs !== 'semantic';

    // ── Execute legs concurrently ──
    let vectorHits: RawHit[] = [];
    let vectorRan = false;
    let ftsHits: RawHit[] = [];
    let ftsRan = false;

    const runVector = async () => {
      try {
        const { vector } = await this.embedder.embed(normalized.semantic);
        vectorHits = await this.vectorWithFallback(lance, vector, where, topK, warnings);
        vectorRan = true;
      } catch (e) {
        if (e instanceof Error && (e as { code?: string }).code === ErrorCode.EMBEDDING_BACKEND_UNAVAILABLE) {
          warnings.push(Warn.embeddingUnavailable);
        } else if (isLockError(e)) {
          warnings.push(Warn.vectorIndexLockedFts);
        } else {
          warnings.push(Warn.embeddingUnavailable);
        }
        effectiveAlpha = 0; // §5.5 — force keyword-only fusion.
      }
    };

    const runFts = async () => {
      try {
        ftsHits = await lance.ftsSearch(normalized.keyword || normalized.semantic, where, topK);
        ftsRan = true;
      } catch (e) {
        if (isLockError(e)) {
          warnings.push(Warn.vectorIndexLockedFts);
        } else {
          // FTS index missing → SQLite LIKE fallback (§5.7).
          warnings.push(Warn.ftsIndexMissing);
          if (sqlite) {
            const hits = sqlite.ftsFallback(params.projectPath, normalized.terms, topK);
            ftsHits = hits.map((h) => ({ row: h.row, rawScore: h.rawScore }));
            ftsRan = true;
          }
        }
      }
    };

    const promises: Promise<void>[] = [];
    if (wantVector) promises.push(runVector());
    if (wantFts) promises.push(runFts());

    await Promise.all(promises);

    // If semantic-only but vector failed, fallback to FTS (§2.3 step 2b, §5.7 fallback)
    if (!wantFts && !vectorRan) {
      await runFts();
    }

    // If the semantic leg is disabled, treat fusion as keyword-only.
    if (!vectorRan) effectiveAlpha = 0;
    if (!ftsRan && vectorRan) effectiveAlpha = 1;

    const fused = fuseRrf(vectorHits, ftsHits, normalized.identifiers, effectiveAlpha, params.rrfK);
    const recency = applyRecencyBoost(fused, params.recencyWeight);
    const gapped = applyGapFilter(recency, params.gapThreshold);

    const mode = this.resolveMode(vectorRan, ftsRan, warnings);
    return {
      results: gapped.results,
      stats: {
        mode, alpha: effectiveAlpha, rrf_k: params.rrfK,
        warnings, gap_cutoff_applied: gapped.applied, candidate_count: fused.length,
      },
      empty: gapped.results.length === 0,
    };
  }

  /** Vector search with lock → brute-force → (caller handles FTS) cascade (§5.1). */
  private async vectorWithFallback(
    lance: LanceReader,
    vector: number[],
    where: string,
    topK: number,
    warnings: string[],
  ): Promise<RawHit[]> {
    try {
      return await lance.vectorSearch(vector, where, topK, false);
    } catch (e) {
      if (!isLockError(e)) throw e;
      // Retry exhausted inside vectorSearch → brute-force ANN (no IVF index).
      try {
        const hits = await lance.vectorSearch(vector, where, topK, true);
        warnings.push(Warn.vectorIndexLockedBrute);
        return hits;
      } catch {
        // Brute-force also failed → signal the caller to drop the vector leg.
        throw e;
      }
    }
  }

  private resolveMode(vectorRan: boolean, ftsRan: boolean, warnings: string[]): SearchMode {
    if (warnings.includes(Warn.ftsIndexMissing) && !vectorRan) return 'sqlite_fallback';
    if (vectorRan && ftsRan) return 'hybrid';
    if (vectorRan) return 'semantic_only';
    return 'keyword_only';
  }

  /** Emit a schema-mismatch warning if >10% of a project's vectors are excluded (§5.2). */
  private async maybeWarnSchemaMismatch(
    lance: LanceReader,
    declaredTotal: number,
    projectPath: string,
    where: string,
    warnings: string[],
    matched?: number,
  ): Promise<void> {
    if (declaredTotal <= 0) return;
    const compatible = matched ?? (await lance.count(where).catch(() => 0));
    const excluded = declaredTotal - compatible;
    if (excluded <= 0) return;
    const ratio = excluded / declaredTotal;
    if (ratio <= SCHEMA_MISMATCH_WARN_RATIO) return;
    const versions = await lance.distinctSchemaVersions(projectPath).catch(() => []);
    const stale = versions.find((v) => v !== SCHEMA_VERSION) ?? 'unknown';
    warnings.push(Warn.schemaMismatch(Math.round(ratio * 100), stale));
  }

  private scoredFromSqlite(hits: { row: ChunkRow; rawScore: number }[]): ScoredResult[] {
    return hits.map((h) => ({
      row: h.row,
      score: h.rawScore,
      score_vector: 0,
      score_fts: h.rawScore,
      identifier_boost: 0,
      recency_multiplier: 1,
      rank_vector: null,
      rank_fts: null,
    }));
  }
}
