import * as lancedb from '@lancedb/lancedb';
import { Index } from '@lancedb/lancedb';
import type Database from 'better-sqlite3';
import { IndexStatsRepo } from '../../storage/repositories/IndexStatsRepo.js';
import { IndexRunsRepo } from '../../storage/repositories/IndexRunsRepo.js';
import { IVF_REBUILD_THRESHOLD, SCHEMA_VERSION } from '../../constants.js';
import { randomUUID } from 'node:crypto';

const IVF_NUM_PARTITIONS = 256;
const IVF_SPEC_SUB_VECTORS = 96; // spec §2.4 — validated against actual dim below

/**
 * Returns the largest numSubVectors ≤ target that evenly divides `dim`.
 * LanceDB requires dim % numSubVectors === 0; preferred divisors are dim/16 or dim/8.
 */
function safeNumSubVectors(dim: number, target: number): number {
  if (dim % target === 0) return target;
  // Try spec value first, then LanceDB preferred defaults
  for (const candidate of [target, Math.floor(dim / 16), Math.floor(dim / 8), 1]) {
    if (candidate > 0 && dim % candidate === 0) return candidate;
  }
  return 1;
}

export interface RebuildResult {
  triggered: boolean;
  /** Reason rebuild was skipped (if triggered=false). */
  reason?: string;
  vector_count: number;
  num_partitions: number;
  num_sub_vectors: number;
  duration_ms: number;
}

/**
 * Checks rebuild threshold and, if met, triggers an IVF-PQ rebuild on the
 * `chunks` table. Always fire-and-forget *after* Phase 2 writes complete.
 *
 * Spec §2.4: rebuild when (vector_count − last_ivf_rebuild_at) ≥ 5000.
 */
export class IvfRebuild {
  private readonly statsRepo: IndexStatsRepo;
  private readonly runsRepo: IndexRunsRepo;

  constructor(
    private readonly db: Database.Database,
    private readonly projectPath: string,
  ) {
    this.statsRepo = new IndexStatsRepo(db);
    this.runsRepo  = new IndexRunsRepo(db);
  }

  async maybeRebuild(
    table: lancedb.Table,
    vectorDim: number,
  ): Promise<RebuildResult> {
    const stats = this.statsRepo.get(this.projectPath);
    const vectorCount      = stats?.vector_count      ?? 0;
    const lastRebuildAt    = stats?.last_ivf_rebuild_at ?? 0;
    const newSinceRebuild  = vectorCount - lastRebuildAt;

    if (newSinceRebuild < IVF_REBUILD_THRESHOLD) {
      return {
        triggered: false,
        reason: `${newSinceRebuild} new vectors since last rebuild (threshold: ${IVF_REBUILD_THRESHOLD})`,
        vector_count: vectorCount,
        num_partitions: IVF_NUM_PARTITIONS,
        num_sub_vectors: safeNumSubVectors(vectorDim, IVF_SPEC_SUB_VECTORS),
        duration_ms: 0,
      };
    }

    const numSubVectors = safeNumSubVectors(vectorDim, IVF_SPEC_SUB_VECTORS);
    const rebuildRunId  = randomUUID();
    const startMs       = Date.now();

    this.runsRepo.create({
      run_id:       rebuildRunId,
      project_path: this.projectPath,
      phase:        'ivf_rebuild',
      status:       'running',
      started_at:   startMs,
      updated_at:   startMs,
      schema_version: SCHEMA_VERSION,
    });

    try {
      await table.createIndex('vector', {
        config: Index.ivfPq({
          numPartitions: IVF_NUM_PARTITIONS,
          numSubVectors,
          distanceType: 'cosine',
        }),
        replace: true,
      });

      const duration_ms = Date.now() - startMs;

      this.statsRepo.updateLastIvfRebuild(this.projectPath, vectorCount);
      this.runsRepo.update(rebuildRunId, {
        status:     'completed',
        updated_at: Date.now(),
      });

      return {
        triggered: true,
        vector_count: vectorCount,
        num_partitions: IVF_NUM_PARTITIONS,
        num_sub_vectors: numSubVectors,
        duration_ms,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.runsRepo.update(rebuildRunId, {
        status:     'error',
        error:      errorMsg,
        updated_at: Date.now(),
      });
      // Re-throw so RunCoordinator can decide whether to surface this
      throw err;
    }
  }
}
