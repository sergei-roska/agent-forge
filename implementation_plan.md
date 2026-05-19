# Implementation Plan — `local-memory-indexer` (Producer)

Reference specs:
- `docs/specs/mcp/08-local-vector-search-agent-memory.md`
- `docs/specs/mcp/08.1-local-memory-indexer-spec.md`

---

## Step 0 — Package scaffold
- Create `servers/local-memory-indexer/` with: `package.json`, `tsconfig.json`, `src/`, `tests/`, `server.manifest.json`.
- Dependencies: `@modelcontextprotocol/sdk`, `better-sqlite3`, `@lancedb/lancedb`, `tree-sitter` + grammars, `ignore`, `@xenova/transformers`, `uuid`, `pdf-parse`, `mammoth`.
- Constant `SCHEMA_VERSION = "1.0"`; env `LOCAL_VECTOR_SEARCH_DATA_ROOT`.

## Step 1 — Storage layer
- `src/storage/paths.ts` — resolver `<data_root>/<project_slug>/{lancedb,state.db}` + slugify `project_path`.
- `src/storage/sqlite.ts` — open DB, `PRAGMA journal_mode=WAL`, `BEGIN IMMEDIATE` helper.
- `src/storage/migrations/001_init.sql` — tables `index_runs`, `file_fingerprints`, `chunks_queue`, `index_stats` + index `idx_chunks_queue_pending` (per spec §3.1).
- `src/storage/repositories/{IndexRunsRepo,FingerprintsRepo,ChunksQueueRepo,IndexStatsRepo}.ts` — CRUD + transactional batch updates.
- `src/storage/lancedb.ts` — open/create `chunks` table per §3.2; schema_version guard.

## Step 2 — Contracts & identifiers
- `src/contracts/{startIndexing,pauseIndexing,getIndexingStatus}.schema.ts` — JSON Schemas from §4.
- `src/identity/chunkId.ts` — `sha256(project_path|file_path|start_line|end_line|content_hash_prefix)`.
- `src/identity/fingerprint.ts` — `{size, mtime_ns, sha256}` for file (streamed).

## Step 3 — Phase 1: Discovery
- `src/indexer/scanner/FilterRules.ts` — order: `exclude_globs` → built-in binary/minified → `.gitignore` (via `ignore`) → `include_globs`.
- `src/indexer/scanner/FileScanner.ts` — tree walk + `worker_threads` pool (`cpus-1`, min 2), shard by subtree, return `FileRecord[]`.
- `src/indexer/scanner/FingerprintDiffer.ts` — diff against `file_fingerprints`: unchanged → `up_to_date`; changed → `pending_parse` + old chunks → `stale`.

## Step 4 — Phase 1: Chunking dispatch
- `src/indexer/chunking/AstChunker.ts` — Tree-sitter (ts/js/py/go/rs/java/c/cpp), boundaries on functions/classes, ~120 lines, snap-to-boundary.
- `src/indexer/chunking/SemanticChunker.ts` — Max-Min over sentence embeddings for md/txt/rst/html/xml.
- `src/indexer/chunking/DocumentParser.ts` — pdf-parse / mammoth → text → SemanticChunker.
- `src/indexer/chunking/ChunkerDispatcher.ts` — extension→chunker table from §2.2.3; processes `pending_parse`; populates `chunks_queue` with `embedding_status='pending'`, `ast_metadata`, `content_hash`, `schema_version`. Enforces `retry_count <= 3`.

## Step 5 — Phase 2: Embedding backends
- `src/indexer/embedding/backends/OllamaBackend.ts` — `qwen3-embedding:8b`, health probe.
- `src/indexer/embedding/backends/TransformersJsBackend.ts` — CPU fallback.
- `src/indexer/embedding/EmbeddingBackendFactory.ts` — order: explicit → ollama (if available) → transformers_js. Batch `100` / `50`.

## Step 6 — Phase 2: Enrichment + Consumer loop
- `src/indexer/enrichment/GraniteEnricher.ts` — `granite4:3b-h` via Ollama; format `[SUMMARY]\n…\n[TAGS]\n…\n[CODE]\n…`. Optional.
- `src/indexer/embedding/EmbedConsumer.ts` — single-threaded loop (spec §2.3.1):
  - SELECT batch by `(project_path, embedding_status='pending')` `ORDER BY priority DESC, created_at ASC`.
  - enrich → embed → upsert LanceDB by `chunk_id` → UPDATE `embedding_status='embedded'` in one transaction.
  - on batch error → `error` status + log to `index_runs`, continue.
- Resumability: read last `index_runs` for `run_id`, continue with remaining `pending`.

## Step 7 — IVF-PQ rebuild
- `src/indexer/optimization/IvfRebuild.ts` — after successful Phase 2, if `vector_count - last_ivf_rebuild_at >= 5000` → `create_index({metric:'cosine', num_partitions:256, num_sub_vectors:96})`; update `index_stats`; log to `index_runs` with `phase='ivf_rebuild'`.

## Step 8 — Run orchestration
- `src/indexer/RunCoordinator.ts` — creates `run_id` (uuid v4), writes `index_runs`, runs selected `phases` sequentially, supports `pause` via cooperative flag (checked between batches).
- `src/indexer/ConcurrencyLock.ts` — reject duplicate start for same `project_path` → `already_running` with `lock_owner` / `lock_age`.

## Step 9 — Error handling (per §5)
- `src/errors/codes.ts` — `DATABASE_LOCKED`, `SCHEMA_MISMATCH`, `PHASE1_PARSE_ERROR`, `EMBEDDING_BACKEND_UNAVAILABLE`, `CONCURRENT_INDEXING_REJECTED`.
- Retry strategy `{1s, 2s, 4s, 8s}` for LanceDB lock; schema guard before every write batch.

## Step 10 — MCP tools
- `src/tools/startIndexing.ts`, `pauseIndexing.ts`, `getIndexingStatus.ts` — wrappers, JSON Schema validation, non-blocking response (Phase 1/2 fire-and-forget).
- `src/server.ts` — register tools via MCP SDK (stdio transport).
- `src/index.ts` — entrypoint.
- `server.manifest.json` — manifest.

## Step 11 — Structured logging & metrics
- `src/observability/logger.ts` — JSON log with `run_id`, `phase`, `chunk_id?`, `duration_ms`, `warning_count`.
- Throughput counter for `eta_seconds` and `progress_bar` in `get_indexing_status`.

## Step 12 — Tests
- `tests/storage/migrations.test.ts` — migrations and schema.
- `tests/scanner/fingerprint.test.ts` — incremental: unchanged skipped, changed → stale.
- `tests/chunking/ast.test.ts` — AST boundaries (class/function not split mid-body).
- `tests/chunking/semantic.test.ts` — Max-Min on markdown.
- `tests/embedding/resumability.test.ts` — kill mid Phase 2, restart with no duplicates.
- `tests/embedding/priority.test.ts` — user_focus > recent > background ordering.
- `tests/errors/schemaMismatch.test.ts` — writes blocked on mismatch.
- `tests/fixtures/repos/{ts-sample,py-sample,md-sample}/`.

## Step 13 — Manual verification
- Run against `agent-forge` repo with Ollama; interrupt Phase 2 mid-flight, restart; verify `chunks_queue` and LanceDB integrity.

---

## Suggested commit order
1. Steps 0–2 (scaffold + storage + contracts) — single PR, no logic.
2. Steps 3–4 (Phase 1) — separate PR with chunking tests.
3. Steps 5–7 (Phase 2 + IVF) — third PR.
4. Steps 8–10 (orchestration + MCP tools) — fourth PR.
5. Steps 11–13 (observability + full test coverage).
