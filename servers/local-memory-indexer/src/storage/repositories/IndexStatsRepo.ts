import type Database from 'better-sqlite3';

export interface IndexStats {
  project_path: string;
  vector_count: number;
  last_ivf_rebuild_at: number;
  updated_at: number;
}

export class IndexStatsRepo {
  constructor(private readonly db: Database.Database) {}

  get(projectPath: string): IndexStats | undefined {
    return this.db
      .prepare('SELECT * FROM index_stats WHERE project_path = ?')
      .get(projectPath) as IndexStats | undefined;
  }

  upsert(stats: Omit<IndexStats, 'updated_at'> & { updated_at?: number }): void {
    const now = stats.updated_at ?? Date.now();
    this.db
      .prepare(
        `INSERT INTO index_stats (project_path, vector_count, last_ivf_rebuild_at, updated_at)
         VALUES (@project_path, @vector_count, @last_ivf_rebuild_at, @updated_at)
         ON CONFLICT(project_path) DO UPDATE SET
          vector_count        = excluded.vector_count,
          last_ivf_rebuild_at = excluded.last_ivf_rebuild_at,
          updated_at          = excluded.updated_at`,
      )
      .run({ ...stats, updated_at: now });
  }

  setVectorCount(projectPath: string, count: number): void {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO index_stats (project_path, vector_count, last_ivf_rebuild_at, updated_at)
         VALUES (?, ?, 0, ?)
         ON CONFLICT(project_path) DO UPDATE SET
          vector_count = ?,
          updated_at   = ?`,
      )
      .run(projectPath, count, now, count, now);
  }

  updateLastIvfRebuild(projectPath: string, vectorCount: number): void {
    const now = Date.now();
    this.db
      .prepare(
        `UPDATE index_stats SET last_ivf_rebuild_at = ?, updated_at = ? WHERE project_path = ?`,
      )
      .run(vectorCount, now, projectPath);
  }
}
