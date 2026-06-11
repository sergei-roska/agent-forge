import type Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import * as lancedb from '@lancedb/lancedb';
import { Index } from '@lancedb/lancedb';
import { SCHEMA_VERSION, IVF_REBUILD_THRESHOLD } from '../constants.js';
import { lanceDbDir } from '../storage/paths.js';
import { CHUNKS_TABLE, openChunksTable } from '../storage/lancedb.js';
import { ChunksQueueRepo } from '../storage/repositories/ChunksQueueRepo.js';
import { FingerprintsRepo } from '../storage/repositories/FingerprintsRepo.js';
import { IndexRunsRepo } from '../storage/repositories/IndexRunsRepo.js';
import { IndexStatsRepo } from '../storage/repositories/IndexStatsRepo.js';
import { withLanceDbRetry } from '../errors/retry.js';
import { fingerprintChanged } from '../identity/fingerprint.js';

// ── Shared result types (mirror search-side doctor) ─────────────────────────

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

/** Legacy shape returned by fixSchemaVersionMismatch (Fix 02). */
export interface SchemaFixResult {
  fixed: string[];
  requiresReindex: boolean;
  counts: { sqlite_bad: number; sqlite_fixed: number; lance_bad: number };
}

const VECTOR_SAMPLE = 500;

export class IndexerDoctor {
  private readonly chunks: ChunksQueueRepo;
  private readonly fps: FingerprintsRepo;
  private readonly runs: IndexRunsRepo;
  private readonly stats: IndexStatsRepo;

  constructor(private readonly db: Database.Database) {
    this.chunks = new ChunksQueueRepo(db);
    this.fps = new FingerprintsRepo(db);
    this.runs = new IndexRunsRepo(db);
    this.stats = new IndexStatsRepo(db);
  }

  /** Full diagnostic pass with optional auto-repair (Fix 05). */
  async run(projectPath: string, autoFix = false): Promise<DoctorResult> {
    const checks: DoctorCheck[] = [];
    const autoFixed: DoctorCheck[] = [];
    const suggested: string[] = [];

    checks.push(await this.checkIndexRuns(projectPath));
    checks.push(await this.checkFingerprints(projectPath));
    checks.push(await this.checkPendingQueue(projectPath));
    checks.push(this.checkDiskSpace(projectPath));

    const table = await this.openTable(projectPath);
    if (table) {
      checks.push(...await this.runLanceChecks(projectPath, table));
    } else {
      checks.push({
        name: 'lancedb_reachable',
        status: 'warning',
        message: 'LanceDB table not found — run start_indexing to create vectors',
      });
    }

    checks.push(...this.runSqliteSchemaChecks(projectPath));

    if (table) {
      checks.push(...await this.runCrossChecks(projectPath, table));
    }

    let issues = checks.filter((c) => c.status === 'error' || c.status === 'warning');

    if (autoFix && issues.length > 0 && table) {
      const fixOutcome = await this.applyAutoFixes(issues, projectPath, table);
      autoFixed.push(...fixOutcome.fixed);
      suggested.push(...fixOutcome.remainingActions);
      const fixedNames = new Set(fixOutcome.fixed.map((f) => f.name));
      issues = issues.filter((i) => !fixedNames.has(i.name));
    } else {
      for (const issue of issues) {
        suggested.push(issue.message);
      }
    }

    return {
      healthy: !issues.some((i) => i.status === 'error'),
      checks: [...checks, ...autoFixed],
      issues,
      auto_fixed: autoFixed,
      suggested_actions: [...new Set(suggested)],
    };
  }

  /** Fix 02: schema_version repair (kept for backward compatibility). */
  async fixSchemaVersionMismatch(projectPath: string): Promise<SchemaFixResult> {
    const fixed: string[] = [];
    const counts = { sqlite_bad: 0, sqlite_fixed: 0, lance_bad: 0 };

    const badRow = this.db
      .prepare<[string]>(
        `SELECT COUNT(*) AS n FROM chunks_queue
         WHERE project_path = ?
           AND (schema_version IS NULL OR schema_version = 'unknown' OR schema_version = '')`,
      )
      .get(projectPath) as { n: number };
    counts.sqlite_bad = badRow.n;

    if (counts.sqlite_bad > 0) {
      const now = Date.now();
      const result = this.db
        .prepare<[string, number, string]>(
          `UPDATE chunks_queue SET schema_version = ?, updated_at = ?
           WHERE project_path = ?
             AND (schema_version IS NULL OR schema_version = 'unknown' OR schema_version = '')`,
        )
        .run(SCHEMA_VERSION, now, projectPath);
      counts.sqlite_fixed = result.changes;
      fixed.push(`SQLite: updated ${counts.sqlite_fixed} chunks to schema_version='${SCHEMA_VERSION}'.`);

      const now2 = Date.now();
      this.db
        .prepare<[number, string, string]>(
          `UPDATE chunks_queue SET embedding_status = 'pending', updated_at = ?
           WHERE project_path = ? AND schema_version = ? AND embedding_status = 'embedded'`,
        )
        .run(now2, projectPath, SCHEMA_VERSION);
    } else {
      fixed.push('SQLite: no chunks with bad schema_version found.');
    }

    counts.lance_bad = await this.probeLanceBadVersions(projectPath);
    if (counts.lance_bad > 0) {
      fixed.push(
        `LanceDB: found ${counts.lance_bad} row(s) with stale schema_version. Re-embed pending chunks to overwrite.`,
      );
    } else {
      fixed.push('LanceDB: no schema_version mismatches detected.');
    }

    return { fixed, requiresReindex: counts.lance_bad > 0, counts };
  }

  // ── Indexer-specific checks ─────────────────────────────────────────────────

  private async checkIndexRuns(projectPath: string): Promise<DoctorCheck> {
    const active = this.runs.getActiveRun(projectPath);
    if (!active) {
      return { name: 'index_runs', status: 'healthy', message: 'No stuck running index runs' };
    }
    const ageMs = active.started_at ? Date.now() - active.started_at : 0;
    if (ageMs > 10 * 60 * 1000) {
      return {
        name: 'index_runs',
        status: 'warning',
        message: `Run ${active.run_id} stuck in 'running' for ${Math.round(ageMs / 60_000)} minutes`,
        details: { run_id: active.run_id, age_ms: ageMs },
      };
    }
    return { name: 'index_runs', status: 'healthy', message: 'Active run within TTL' };
  }

  private async checkFingerprints(projectPath: string): Promise<DoctorCheck> {
    const fingerprints = this.fps.listByProject(projectPath);
    let mismatched = 0;
    let missing = 0;

    for (const fp of fingerprints.slice(0, 200)) {
      const fullPath = fp.file_path.startsWith('/')
        ? fp.file_path
        : path.join(projectPath, fp.file_path);
      try {
        if (await fingerprintChanged(fullPath, {
          size_bytes: fp.size_bytes ?? 0,
          mtime_ns: fp.mtime_ns ?? 0,
          content_hash_sha256: fp.content_hash_sha256 ?? '',
        })) {
          mismatched++;
        }
      } catch {
        missing++;
      }
    }

    if (mismatched === 0 && missing === 0) {
      return { name: 'fingerprints', status: 'healthy', message: 'Fingerprints match disk state (sampled)' };
    }

    return {
      name: 'fingerprints',
      status: missing > 0 ? 'warning' : 'healthy',
      message: `${mismatched} modified file(s), ${missing} missing file(s) in fingerprint sample`,
      details: { mismatched, missing, sampled: Math.min(fingerprints.length, 200) },
    };
  }

  private async checkPendingQueue(projectPath: string): Promise<DoctorCheck> {
    const pending = this.chunks.countPending(projectPath);
    const errored = this.db
      .prepare(`SELECT COUNT(*) AS n FROM chunks_queue WHERE project_path = ? AND embedding_status = 'error'`)
      .get(projectPath) as { n: number };

    if (errored.n === 0) {
      return {
        name: 'pending_queue',
        status: 'healthy',
        message: pending > 0 ? `${pending} chunks pending embedding` : 'Queue empty — all chunks embedded',
      };
    }

    return {
      name: 'pending_queue',
      status: 'warning',
      message: `${errored.n} chunk(s) in error state, ${pending} pending`,
      details: { errored: errored.n, pending },
    };
  }

  private checkDiskSpace(projectPath: string): DoctorCheck {
    try {
      const dir = lanceDbDir(projectPath);
      fs.mkdirSync(path.dirname(dir), { recursive: true });
      fs.accessSync(path.dirname(dir), fs.constants.W_OK);
      return { name: 'disk_space', status: 'healthy', message: 'Index data directory is writable' };
    } catch {
      return { name: 'disk_space', status: 'error', message: 'Index data directory is not writable' };
    }
  }

  // ── Lance / cross-layer checks ──────────────────────────────────────────────

  private async runLanceChecks(projectPath: string, table: lancedb.Table): Promise<DoctorCheck[]> {
    const safe = projectPath.replace(/'/g, "''");
    const checks: DoctorCheck[] = [];

    const versionRows = await table
      .query()
      .where(`project_path = '${safe}'`)
      .select(['schema_version'])
      .limit(1000)
      .toArray();
    const lanceVersions = [...new Set(versionRows.map((r) => String(r.schema_version)))];
    const badVersions = lanceVersions.filter((v) => v !== SCHEMA_VERSION && v !== 'undefined' && v !== 'null');
    checks.push(
      badVersions.length === 0
        ? { name: 'schema_version', status: 'healthy', message: `LanceDB schema_version=${SCHEMA_VERSION}` }
        : {
            name: 'schema_version',
            status: 'error',
            message: `LanceDB schema mismatch: [${badVersions.join(', ')}]`,
            details: { lance_versions: lanceVersions },
          },
    );

    try {
      await table.query().fullTextSearch('probe', { columns: ['text'] }).limit(1).toArray();
      checks.push({ name: 'fts_index', status: 'healthy', message: 'FTS index accessible' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      checks.push({
        name: 'fts_index',
        status: 'warning',
        message: 'FTS index missing or broken',
        details: { error: msg },
      });
    }

    const fileRows = await table.query().where(`project_path = '${safe}'`).select(['file_path']).limit(10_000).toArray();
    const filePaths = [...new Set(fileRows.map((r) => String(r.file_path)).filter(Boolean))];
    const staleFiles = filePaths.filter((f) => !fs.existsSync(f));
    checks.push(
      staleFiles.length === 0
        ? { name: 'stale_chunks', status: 'healthy', message: 'No stale file chunks' }
        : {
            name: 'stale_chunks',
            status: 'warning',
            message: `${staleFiles.length} indexed file(s) deleted from disk`,
            details: { stale_files: staleFiles.slice(0, 20) },
          },
    );

    return checks;
  }

  private runSqliteSchemaChecks(projectPath: string): DoctorCheck[] {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT schema_version FROM chunks_queue WHERE project_path = ? AND schema_version IS NOT NULL`,
      )
      .all(projectPath) as { schema_version: string }[];
    const versions = rows.map((r) => r.schema_version);
    const bad = versions.filter((v) => v !== SCHEMA_VERSION);
    if (bad.length === 0) {
      return [{ name: 'sqlite_schema_version', status: 'healthy', message: `SQLite schema_version=${SCHEMA_VERSION}` }];
    }
    return [{
      name: 'sqlite_schema_version',
      status: 'error',
      message: `SQLite schema mismatch: [${bad.join(', ')}]`,
      details: { sqlite_versions: versions },
    }];
  }

  private async runCrossChecks(projectPath: string, table: lancedb.Table): Promise<DoctorCheck[]> {
    const safe = projectPath.replace(/'/g, "''");
    const where = `project_path = '${safe}' AND schema_version = '${SCHEMA_VERSION}'`;
    const checks: DoctorCheck[] = [];

    const lanceCount = await table.countRows(where).catch(() => 0);
    const sqliteCount = this.chunks.countAll(projectPath);
    const diff = Math.abs(lanceCount - sqliteCount);
    const threshold = Math.max(10, Math.floor(Math.max(lanceCount, sqliteCount) * 0.05));
    checks.push(
      diff <= threshold
        ? { name: 'chunk_count', status: 'healthy', message: `Counts aligned: Lance=${lanceCount}, SQLite=${sqliteCount}` }
        : {
            name: 'chunk_count',
            status: diff > threshold * 10 ? 'error' : 'warning',
            message: `Count mismatch: Lance=${lanceCount}, SQLite=${sqliteCount} (diff=${diff})`,
            details: { lance: lanceCount, sqlite: sqliteCount, diff },
          },
    );

    const embeddedIds = this.chunks.getEmbeddedIds(projectPath, VECTOR_SAMPLE);
    let missingVectors: string[] = [];
    if (embeddedIds.length > 0) {
      const safeIds = embeddedIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(', ');
      const present = await table
        .query()
        .where(`${where} AND chunk_id IN (${safeIds})`)
        .select(['chunk_id'])
        .limit(embeddedIds.length)
        .toArray();
      const presentSet = new Set(present.map((r) => String(r.chunk_id)));
      missingVectors = embeddedIds.filter((id) => !presentSet.has(id));
    }

    checks.push(
      missingVectors.length === 0
        ? { name: 'vector_consistency', status: 'healthy', message: 'Embedded chunks have vectors in LanceDB' }
        : {
            name: 'vector_consistency',
            status: 'error',
            message: `${missingVectors.length} embedded chunk(s) missing vectors in LanceDB`,
            details: { missing_vectors: missingVectors.slice(0, 10) },
          },
    );

    const stats = this.stats.get(projectPath);
    if (stats && stats.vector_count > 0) {
      const sinceRebuild = stats.vector_count - stats.last_ivf_rebuild_at;
      checks.push(
        sinceRebuild < IVF_REBUILD_THRESHOLD
          ? { name: 'ivf_freshness', status: 'healthy', message: `IVF fresh (${sinceRebuild}/${IVF_REBUILD_THRESHOLD})` }
          : {
              name: 'ivf_freshness',
              status: 'warning',
              message: `IVF rebuild recommended (${sinceRebuild} vectors since last rebuild)`,
            },
      );
    }

    return checks;
  }

  // ── Auto-fix ────────────────────────────────────────────────────────────────

  private async applyAutoFixes(
    issues: DoctorCheck[],
    projectPath: string,
    table: lancedb.Table,
  ): Promise<{ fixed: DoctorCheck[]; remainingActions: string[] }> {
    const fixed: DoctorCheck[] = [];
    const remainingActions: string[] = [];

    for (const issue of issues) {
      switch (issue.name) {
        case 'sqlite_schema_version':
        case 'missing_schema_version': {
          const result = await this.fixSchemaVersionMismatch(projectPath);
          fixed.push({
            name: issue.name,
            status: 'fixed',
            auto_fixed: true,
            message: result.fixed.join(' '),
            details: result.counts,
          });
          if (result.requiresReindex) {
            remainingActions.push('Re-embed pending chunks to fix LanceDB schema_version rows.');
          }
          break;
        }

        case 'vector_consistency': {
          const ids = (issue.details?.missing_vectors as string[] | undefined) ?? [];
          if (ids.length > 0) {
            this.chunks.markPending(ids);
            fixed.push({
              name: issue.name,
              status: 'fixed',
              auto_fixed: true,
              message: `Marked ${ids.length} chunk(s) pending for re-embedding`,
            });
          }
          break;
        }

        case 'stale_chunks': {
          const staleFiles = (issue.details?.stale_files as string[] | undefined) ?? [];
          if (staleFiles.length > 0) {
            await withLanceDbRetry(async () => {
              for (const file of staleFiles) {
                const esc = file.replace(/'/g, "''");
                await table.delete(`file_path = '${esc}'`);
              }
            });
            this.chunks.deleteByFilePaths(projectPath, staleFiles);
            this.fps.deleteByFilePaths(projectPath, staleFiles);
            fixed.push({
              name: issue.name,
              status: 'fixed',
              auto_fixed: true,
              message: `Removed chunks for ${staleFiles.length} stale file(s)`,
            });
          }
          break;
        }

        case 'fts_index': {
          try {
            await withLanceDbRetry(() =>
              table.createIndex('text', { config: Index.fts() }),
            );
            fixed.push({
              name: issue.name,
              status: 'fixed',
              auto_fixed: true,
              message: 'Built FTS index on text column',
            });
          } catch (err) {
            remainingActions.push(`FTS build failed: ${err instanceof Error ? err.message : String(err)}`);
          }
          break;
        }

        case 'pending_queue': {
          const reset = this.db
            .prepare(
              `UPDATE chunks_queue SET embedding_status = 'pending', retry_count = 0, updated_at = ?
               WHERE project_path = ? AND embedding_status = 'error'`,
            )
            .run(Date.now(), projectPath);
          if (reset.changes > 0) {
            fixed.push({
              name: issue.name,
              status: 'fixed',
              auto_fixed: true,
              message: `Reset ${reset.changes} errored chunk(s) to pending`,
            });
          }
          break;
        }

        default:
          remainingActions.push(issue.message);
      }
    }

    return { fixed, remainingActions };
  }

  private async openTable(projectPath: string): Promise<lancedb.Table | null> {
    try {
      return await openChunksTable(projectPath);
    } catch {
      return null;
    }
  }

  private async probeLanceBadVersions(projectPath: string): Promise<number> {
    const dir = lanceDbDir(projectPath);
    try {
      const conn = await lancedb.connect(dir);
      const names = await conn.tableNames();
      if (!names.includes(CHUNKS_TABLE)) return 0;
      const table = await conn.openTable(CHUNKS_TABLE);
      const safe = projectPath.replace(/'/g, "''");
      const rows = await table
        .query()
        .select(['schema_version'])
        .where(`project_path = '${safe}' AND (schema_version IS NULL OR schema_version != '${SCHEMA_VERSION}')`)
        .limit(10_000)
        .toArray();
      return rows.length;
    } catch {
      return 0;
    }
  }
}
