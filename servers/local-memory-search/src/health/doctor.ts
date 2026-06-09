import fs from 'node:fs';
import type { LanceReader } from '../storage/LanceReader.js';
import type { SqliteReader } from '../storage/SqliteReader.js';
import { buildWherePredicate } from '../storage/filters.js';
import { SCHEMA_VERSION } from '../constants.js';
import { IVF_REBUILD_THRESHOLD } from './constants.js';

export type DoctorCheckStatus = 'healthy' | 'warning' | 'error' | 'fixed';

export interface DoctorCheck {
  name: string;
  status: DoctorCheckStatus;
  message: string;
  details?: Record<string, unknown>;
  auto_fixed?: boolean;
}

export interface DoctorResult {
  healthy: boolean;
  checks: DoctorCheck[];
  issues: DoctorCheck[];
  auto_fixed: DoctorCheck[];
  suggested_actions: string[];
}

export interface DoctorContext {
  projectPath: string;
  lance: LanceReader | null;
  sqlite: SqliteReader | null;
}

const VECTOR_CONSISTENCY_SAMPLE = 500;

/** Read-only index consistency diagnostics (Spec Fix 05 / §4.4). */
export async function doctorIndex(ctx: DoctorContext): Promise<DoctorResult> {
  const checks: DoctorCheck[] = [];
  const suggested: string[] = [];

  checks.push(checkIndexReachable(ctx));
  if (ctx.lance) {
    checks.push(...await runLanceChecks(ctx));
  }
  if (ctx.sqlite) {
    checks.push(...runSqliteChecks(ctx));
  }
  if (ctx.lance && ctx.sqlite) {
    checks.push(...await runCrossChecks(ctx));
  }

  const issues = checks.filter((c) => c.status === 'error' || c.status === 'warning');
  for (const issue of issues) {
    suggested.push(...suggestedActionFor(issue));
  }

  return {
    healthy: !issues.some((i) => i.status === 'error'),
    checks,
    issues,
    auto_fixed: [],
    suggested_actions: [...new Set(suggested)],
  };
}

function checkIndexReachable(ctx: DoctorContext): DoctorCheck {
  const lanceOk = ctx.lance !== null;
  const sqliteOk = ctx.sqlite !== null;
  if (lanceOk && sqliteOk) {
    return { name: 'index_reachable', status: 'healthy', message: 'LanceDB and SQLite state are accessible' };
  }
  if (!lanceOk && !sqliteOk) {
    return {
      name: 'index_reachable',
      status: 'error',
      message: 'No index found for this project',
      details: { lancedb: false, sqlite: false },
    };
  }
  return {
    name: 'index_reachable',
    status: 'warning',
    message: lanceOk ? 'SQLite state missing — some checks skipped' : 'LanceDB missing — vector search unavailable',
    details: { lancedb: lanceOk, sqlite: sqliteOk },
  };
}

async function runLanceChecks(ctx: DoctorContext): Promise<DoctorCheck[]> {
  const lance = ctx.lance!;
  const checks: DoctorCheck[] = [];

  checks.push(await checkSchemaVersion(lance, ctx));
  checks.push(await checkMissingSchemaVersion(lance, ctx));
  checks.push(await checkFtsIndex(lance, ctx));
  checks.push(await checkStaleChunks(lance, ctx));

  return checks;
}

function runSqliteChecks(ctx: DoctorContext): DoctorCheck[] {
  const sqlite = ctx.sqlite!;
  const versions = sqlite.distinctSchemaVersions(ctx.projectPath);
  const bad = versions.filter((v) => v !== SCHEMA_VERSION && v !== '' && v !== 'null');

  if (bad.length === 0) {
    return [{
      name: 'sqlite_schema_version',
      status: 'healthy',
      message: `SQLite chunks use schema_version=${SCHEMA_VERSION}`,
    }];
  }

  return [{
    name: 'sqlite_schema_version',
    status: 'error',
    message: `SQLite schema version mismatch: found [${bad.join(', ')}], expected ${SCHEMA_VERSION}`,
    details: { sqlite_versions: versions, expected: SCHEMA_VERSION },
  }];
}

async function runCrossChecks(ctx: DoctorContext): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];
  checks.push(await checkChunkCount(ctx));
  checks.push(await checkVectorConsistency(ctx));
  checks.push(checkIvfFreshness(ctx));
  return checks;
}

async function checkSchemaVersion(lance: LanceReader, ctx: DoctorContext): Promise<DoctorCheck> {
  const versions = await lance.distinctSchemaVersions(ctx.projectPath);
  const bad = versions.filter((v) => v !== SCHEMA_VERSION && v !== 'undefined' && v !== 'null' && v !== '');
  if (bad.length === 0) {
    return { name: 'schema_version', status: 'healthy', message: `All LanceDB rows use schema_version=${SCHEMA_VERSION}` };
  }
  return {
    name: 'schema_version',
    status: 'error',
    message: `Schema version mismatch: found [${bad.join(', ')}], expected ${SCHEMA_VERSION}`,
    details: { lance_versions: versions, expected: SCHEMA_VERSION },
  };
}

async function checkChunkCount(ctx: DoctorContext): Promise<DoctorCheck> {
  const lance = ctx.lance!;
  const sqlite = ctx.sqlite!;
  const where = buildWherePredicate(ctx.projectPath);

  const lanceCount = await lance.count(where).catch(() => 0);
  const sqliteCount = sqlite.countAllChunks(ctx.projectPath);
  const diff = Math.abs(lanceCount - sqliteCount);
  const threshold = Math.max(10, Math.floor(Math.max(lanceCount, sqliteCount) * 0.05));

  if (diff <= threshold) {
    return {
      name: 'chunk_count',
      status: 'healthy',
      message: `Counts aligned: LanceDB=${lanceCount}, SQLite=${sqliteCount}`,
      details: { lance: lanceCount, sqlite: sqliteCount, diff, threshold },
    };
  }

  return {
    name: 'chunk_count',
    status: diff > threshold * 10 ? 'error' : 'warning',
    message: `Chunk count mismatch: LanceDB=${lanceCount}, SQLite=${sqliteCount} (diff=${diff})`,
    details: { lance: lanceCount, sqlite: sqliteCount, diff, threshold },
  };
}

async function checkVectorConsistency(ctx: DoctorContext): Promise<DoctorCheck> {
  const lance = ctx.lance!;
  const sqlite = ctx.sqlite!;
  const where = buildWherePredicate(ctx.projectPath);

  const embeddedIds = sqlite.getEmbeddedChunkIds(ctx.projectPath, VECTOR_CONSISTENCY_SAMPLE);
  const present = embeddedIds.length > 0
    ? await lance.filterExistingChunkIds(where, embeddedIds)
    : new Set<string>();
  const missingVectors = embeddedIds.filter((id) => !present.has(id));

  const lanceIds = await lance.sampleChunkIds(where, VECTOR_CONSISTENCY_SAMPLE);
  const statusMap = sqlite.getEmbeddingStatusMap(lanceIds);
  const extraVectors = lanceIds.filter((id) => statusMap.get(id) !== 'embedded');

  if (missingVectors.length === 0 && extraVectors.length === 0) {
    return { name: 'vector_consistency', status: 'healthy', message: 'Vector ↔ embedding_status consistent' };
  }

  return {
    name: 'vector_consistency',
    status: 'error',
    message:
      `Vector/state inconsistency: ${missingVectors.length} embedded chunks missing vectors, ` +
      `${extraVectors.length} vectors with non-embedded status`,
    details: {
      missing_vectors: missingVectors.slice(0, 10),
      extra_vectors: extraVectors.slice(0, 10),
      sample_limit: VECTOR_CONSISTENCY_SAMPLE,
    },
  };
}

async function checkFtsIndex(lance: LanceReader, ctx: DoctorContext): Promise<DoctorCheck> {
  const where = buildWherePredicate(ctx.projectPath);
  try {
    await lance.ftsSearch('health probe', where, 1);
    return { name: 'fts_index', status: 'healthy', message: 'FTS index accessible' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/fts|full.?text|index not found/i.test(msg)) {
      return {
        name: 'fts_index',
        status: 'warning',
        message: 'FTS index not built — keyword search falls back to SQLite LIKE',
        details: { error: msg },
      };
    }
    return { name: 'fts_index', status: 'error', message: `FTS index error: ${msg}`, details: { error: msg } };
  }
}

async function checkStaleChunks(lance: LanceReader, ctx: DoctorContext): Promise<DoctorCheck> {
  const filePaths = await lance.distinctFilePaths(buildWherePredicate(ctx.projectPath));
  const staleFiles = filePaths.filter((f) => !fs.existsSync(f));

  if (staleFiles.length === 0) {
    return { name: 'stale_chunks', status: 'healthy', message: 'No stale chunks from deleted files' };
  }

  return {
    name: 'stale_chunks',
    status: 'warning',
    message: `${staleFiles.length} indexed file(s) no longer exist on disk`,
    details: { stale_files: staleFiles.slice(0, 20), total_stale: staleFiles.length },
  };
}

async function checkMissingSchemaVersion(lance: LanceReader, ctx: DoctorContext): Promise<DoctorCheck> {
  const safe = ctx.projectPath.replace(/'/g, "''");
  const missing = await lance.queryRaw(
    `project_path = '${safe}' AND (schema_version IS NULL OR schema_version = '' OR schema_version = 'unknown')`,
    ['chunk_id', 'file_path', 'schema_version'],
    100,
  );

  if (missing.length === 0) {
    return { name: 'missing_schema_version', status: 'healthy', message: 'All chunks have valid schema_version' };
  }

  return {
    name: 'missing_schema_version',
    status: 'error',
    message: `${missing.length}+ chunks missing/unknown schema_version (excluded from search)`,
    details: { examples: missing.slice(0, 10) },
  };
}

function checkIvfFreshness(ctx: DoctorContext): DoctorCheck {
  const stats = ctx.sqlite!.stats(ctx.projectPath);
  if (stats.vector_count === 0) {
    return { name: 'ivf_freshness', status: 'healthy', message: 'No vectors indexed yet' };
  }

  const vectorsSinceRebuild = stats.vector_count - stats.last_ivf_rebuild_at;
  if (vectorsSinceRebuild < IVF_REBUILD_THRESHOLD) {
    return {
      name: 'ivf_freshness',
      status: 'healthy',
      message: `IVF-PQ fresh: ${vectorsSinceRebuild}/${IVF_REBUILD_THRESHOLD} vectors since last rebuild`,
      details: { vectors_since_rebuild: vectorsSinceRebuild, threshold: IVF_REBUILD_THRESHOLD },
    };
  }

  return {
    name: 'ivf_freshness',
    status: 'warning',
    message: `IVF-PQ rebuild recommended: ${vectorsSinceRebuild} vectors since last rebuild (threshold: ${IVF_REBUILD_THRESHOLD})`,
    details: { vectors_since_rebuild: vectorsSinceRebuild, threshold: IVF_REBUILD_THRESHOLD },
  };
}

function suggestedActionFor(issue: DoctorCheck): string[] {
  switch (issue.name) {
    case 'index_reachable':
      return ['Run start_indexing (Indexer service) to build the index.'];
    case 'schema_version':
    case 'missing_schema_version':
    case 'sqlite_schema_version':
      return ['Run doctor_index with auto_fix=true on the Indexer service, or start_indexing with force=true.'];
    case 'chunk_count':
    case 'vector_consistency':
      return ['Run doctor_index with auto_fix=true on the Indexer service to reconcile state, then re-embed pending chunks.'];
    case 'fts_index':
      return ['Run doctor_index with auto_fix=true on the Indexer service to build the FTS index.'];
    case 'stale_chunks':
      return ['Run doctor_index with auto_fix=true on the Indexer service to remove stale chunks.'];
    case 'ivf_freshness':
      return ['Complete embedding; IVF-PQ rebuild runs automatically when the threshold is reached.'];
    default:
      return [issue.message];
  }
}

/** Subset summary for health_check(verbose=true). */
export function summarizeDoctor(result: DoctorResult): {
  healthy: boolean;
  issue_count: number;
  critical_issues: number;
  warnings: string[];
} {
  return {
    healthy: !result.issues.some((i) => i.status === 'error'),
    issue_count: result.issues.length,
    critical_issues: result.issues.filter((i) => i.status === 'error').length,
    warnings: result.checks.filter((c) => c.status === 'warning').map((c) => c.message),
  };
}
