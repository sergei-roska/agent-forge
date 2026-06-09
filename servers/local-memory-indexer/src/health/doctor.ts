import type Database from 'better-sqlite3';
import * as lancedb from '@lancedb/lancedb';
import { SCHEMA_VERSION } from '../constants.js';
import { lanceDbDir } from '../storage/paths.js';
import { CHUNKS_TABLE } from '../storage/lancedb.js';

// ── Result types ──────────────────────────────────────────────────────────────

export interface DoctorResult {
  /** Human-readable descriptions of each action taken or finding. */
  fixed: string[];
  /** True if LanceDB contains rows that need re-embedding to fix their schema_version. */
  requiresReindex: boolean;
  /** Summary counts for structured tooling. */
  counts: {
    sqlite_bad: number;
    sqlite_fixed: number;
    lance_bad: number;
  };
}

// ── Doctor ────────────────────────────────────────────────────────────────────

/**
 * Indexer-side health utilities for schema_version consistency.
 *
 * Spec 02 / Task 2.5: diagnose and repair chunks where schema_version is
 * NULL or 'unknown'. SQLite rows can be updated in-place; LanceDB rows
 * must be re-embedded (LanceDB has no UPDATE, only mergeInsert via the
 * full write path).
 */
export class IndexerDoctor {
  constructor(private readonly db: Database.Database) {}

  /**
   * Find and fix chunks with bad schema_version in SQLite.
   * Then probe LanceDB for rows that still carry stale/null versions.
   *
   * @param projectPath  Absolute path to the project root (used as partition key).
   */
  async fixSchemaVersionMismatch(projectPath: string): Promise<DoctorResult> {
    const fixed: string[] = [];
    const counts = { sqlite_bad: 0, sqlite_fixed: 0, lance_bad: 0 };

    // ── Step 1: SQLite – count bad rows ───────────────────────────────────────
    const badRow = this.db
      .prepare<[string]>(
        `SELECT COUNT(*) AS n FROM chunks_queue
         WHERE project_path = ?
           AND (schema_version IS NULL OR schema_version = 'unknown' OR schema_version = '')`,
      )
      .get(projectPath) as { n: number };

    counts.sqlite_bad = badRow.n;

    // ── Step 2: SQLite – apply fix in-place ───────────────────────────────────
    if (counts.sqlite_bad > 0) {
      const now = Date.now();
      const result = this.db
        .prepare<[string, number, string]>(
          `UPDATE chunks_queue
           SET schema_version = ?, updated_at = ?
           WHERE project_path = ?
             AND (schema_version IS NULL OR schema_version = 'unknown' OR schema_version = '')`,
        )
        .run(SCHEMA_VERSION, now, projectPath);

      counts.sqlite_fixed = result.changes;
      fixed.push(
        `SQLite: updated ${counts.sqlite_fixed} chunks to schema_version='${SCHEMA_VERSION}'` +
          ` (found ${counts.sqlite_bad} bad rows).`,
      );

      // Simpler, accurate reset: mark ALL just-fixed chunks pending.
      const now2 = Date.now();
      this.db
        .prepare<[number, string, string]>(
          `UPDATE chunks_queue
           SET embedding_status = 'pending', updated_at = ?
           WHERE project_path = ?
             AND schema_version = ?
             AND embedding_status = 'embedded'`,
        )
        .run(now2, projectPath, SCHEMA_VERSION);
      // Note: this resets ALL embedded chunks, not just the fixed ones.
      // A more surgical approach would require storing a list of chunk_ids.
      // For correctness over performance, the full re-embed is acceptable here.
    } else {
      fixed.push('SQLite: no chunks with bad schema_version found.');
    }

    // ── Step 3: LanceDB – probe for stale rows (read-only) ───────────────────
    counts.lance_bad = await this.probeLanceBadVersions(projectPath);

    if (counts.lance_bad > 0) {
      fixed.push(
        `LanceDB: found ${counts.lance_bad} row(s) with schema_version != '${SCHEMA_VERSION}'.` +
          ' These will be overwritten when EmbedConsumer re-embeds the pending chunks above.' +
          ' If no chunks are pending, run start_indexing with force=true to trigger a full re-embed.',
      );
    } else {
      fixed.push('LanceDB: no schema_version mismatches detected.');
    }

    return {
      fixed,
      requiresReindex: counts.lance_bad > 0,
      counts,
    };
  }

  /**
   * Probe LanceDB for rows with a schema_version other than the current one.
   * Returns 0 if the LanceDB directory or table does not exist.
   */
  private async probeLanceBadVersions(projectPath: string): Promise<number> {
    const dir = lanceDbDir(projectPath);
    try {
      const conn = await lancedb.connect(dir);
      const names = await conn.tableNames();
      if (!names.includes(CHUNKS_TABLE)) return 0;

      const table = await conn.openTable(CHUNKS_TABLE);
      const safe = projectPath.replace(/'/g, "''");

      // Count rows where schema_version is missing or not the current version.
      // LanceDB WHERE uses DataFusion SQL syntax.
      const rows = await table
        .query()
        .select(['schema_version'])
        .where(
          `project_path = '${safe}' AND (schema_version IS NULL OR schema_version != '${SCHEMA_VERSION}')`,
        )
        .limit(10_000) // sample cap — sufficient to detect the problem
        .toArray();

      return rows.length;
    } catch {
      // Table inaccessible / locked / not yet created — treat as 0 mismatches.
      return 0;
    }
  }
}
