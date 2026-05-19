export const MIGRATIONS: { name: string; sql: string }[] = [
  {
    name: '001_init.sql',
    sql: `
CREATE TABLE IF NOT EXISTS index_runs (
  run_id              TEXT PRIMARY KEY,
  project_path        TEXT NOT NULL,
  phase               TEXT,
  status              TEXT,
  started_at          INTEGER,
  updated_at          INTEGER,
  files_discovered    INTEGER DEFAULT 0,
  files_parsed        INTEGER DEFAULT 0,
  chunks_created      INTEGER DEFAULT 0,
  chunks_updated      INTEGER DEFAULT 0,
  chunks_embedded     INTEGER DEFAULT 0,
  chunks_total_pending INTEGER DEFAULT 0,
  warnings            TEXT,
  error               TEXT,
  backend_used        TEXT,
  schema_version      TEXT
);

CREATE TABLE IF NOT EXISTS file_fingerprints (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  project_path        TEXT NOT NULL,
  file_path           TEXT NOT NULL,
  size_bytes          INTEGER,
  mtime_ns            INTEGER,
  content_hash_sha256 TEXT,
  status              TEXT,
  retry_count         INTEGER DEFAULT 0,
  last_indexed_at     INTEGER,
  schema_version      TEXT,
  UNIQUE(project_path, file_path)
);

CREATE TABLE IF NOT EXISTS chunks_queue (
  chunk_id            TEXT PRIMARY KEY,
  project_path        TEXT NOT NULL,
  file_path           TEXT NOT NULL,
  start_line          INTEGER,
  end_line            INTEGER,
  raw_text            TEXT,
  enriched_text       TEXT,
  content_hash        TEXT,
  ast_metadata        TEXT,
  embedding_status    TEXT,
  priority            INTEGER DEFAULT 1,
  retry_count         INTEGER DEFAULT 0,
  created_at          INTEGER,
  updated_at          INTEGER,
  schema_version      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chunks_queue_pending
  ON chunks_queue(project_path, embedding_status, priority DESC, created_at ASC);

CREATE TABLE IF NOT EXISTS index_stats (
  project_path        TEXT PRIMARY KEY,
  vector_count        INTEGER DEFAULT 0,
  last_ivf_rebuild_at INTEGER DEFAULT 0,
  updated_at          INTEGER
);
    `.trim(),
  },
];
