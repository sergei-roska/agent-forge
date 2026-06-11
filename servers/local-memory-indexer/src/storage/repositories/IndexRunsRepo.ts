import type Database from 'better-sqlite3';

export interface IndexRun {
  run_id: string;
  project_path: string;
  phase?: string;
  status?: string;
  started_at?: number;
  updated_at?: number;
  files_discovered?: number;
  files_parsed?: number;
  chunks_created?: number;
  chunks_updated?: number;
  chunks_embedded?: number;
  chunks_total_pending?: number;
  warnings?: string;
  error?: string;
  backend_used?: string;
  schema_version?: string;
}

export class IndexRunsRepo {
  constructor(private readonly db: Database.Database) {}

  create(run: IndexRun): void {
    const row: Required<IndexRun> = {
      phase:                null as unknown as string,
      status:               null as unknown as string,
      started_at:           null as unknown as number,
      updated_at:           null as unknown as number,
      files_discovered:     0,
      files_parsed:         0,
      chunks_created:       0,
      chunks_updated:       0,
      chunks_embedded:      0,
      chunks_total_pending: 0,
      warnings:             null as unknown as string,
      error:                null as unknown as string,
      backend_used:         null as unknown as string,
      schema_version:       null as unknown as string,
      ...run,
    };
    this.db
      .prepare(
        `INSERT INTO index_runs
          (run_id, project_path, phase, status, started_at, updated_at,
           files_discovered, files_parsed, chunks_created, chunks_updated,
           chunks_embedded, chunks_total_pending, warnings, error, backend_used, schema_version)
         VALUES
          (@run_id, @project_path, @phase, @status, @started_at, @updated_at,
           @files_discovered, @files_parsed, @chunks_created, @chunks_updated,
           @chunks_embedded, @chunks_total_pending, @warnings, @error, @backend_used, @schema_version)`,
      )
      .run(row);
  }

  update(runId: string, fields: Partial<Omit<IndexRun, 'run_id'>>): void {
    const entries = Object.entries(fields);
    if (entries.length === 0) return;
    const set = entries.map(([k]) => `${k} = @${k}`).join(', ');
    this.db
      .prepare(`UPDATE index_runs SET ${set} WHERE run_id = @run_id`)
      .run({ ...fields, run_id: runId });
  }

  getById(runId: string): IndexRun | undefined {
    return this.db
      .prepare('SELECT * FROM index_runs WHERE run_id = ?')
      .get(runId) as IndexRun | undefined;
  }

  getMostRecent(projectPath: string): IndexRun | undefined {
    return this.db
      .prepare(
        'SELECT * FROM index_runs WHERE project_path = ? ORDER BY started_at DESC LIMIT 1',
      )
      .get(projectPath) as IndexRun | undefined;
  }

  getActiveRun(projectPath: string): IndexRun | undefined {
    return this.db
      .prepare(
        `SELECT * FROM index_runs WHERE project_path = ? AND status = 'running' ORDER BY started_at DESC LIMIT 1`,
      )
      .get(projectPath) as IndexRun | undefined;
  }
}
