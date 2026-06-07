========================
Implementation Spec
========================

Title
- `local-memory-search` Server

Problem Statement
- Existing vector-search transport can become unavailable (`Transport closed`), which blocks agent workflows that depend on semantic retrieval, hybrid search, and indexing updates.
- The blueprint covers 7 Drupal-focused servers, but it does not provide a resilient local semantic retrieval server optimized for autonomous AI-agent execution.
- This spec defines an optional, fully local MCP server that keeps retrieval and indexing usable even when remote MCP infrastructure is degraded.
- Current search implementations often fail due to loss of context in arbitrary chunking, inability to find exact technical terms alongside semantic matches, and lack of relational understanding.
- Scaling to large corporate repositories (50k+ files) requires architectural patterns often missing in naive implementations (e.g., parallelism, disk-optimized storage, resumable embedding phases).
- Out of scope: replacing domain-specific Drupal runtime/config tools from specs `01` to `07`.

Inputs
- task_id: Unknown
- url: Unknown
- user_prompt: Add Spec 08 for a practical, local custom MCP vector search server for internal agent use.
- extra_context: `specs/mcp/00-foundation-contracts.md`, existing `mcp-vector-search` operational instability observations, best practices from `mcp-vector-search` and `mcp-local-rag`.

Current State (if determinable)
- Current workflows can fail when external vector MCP transport drops.
- Agent productivity depends on semantic code/doc lookup, but retrieval is not guaranteed under intermittent server outages.
- Constraints/contracts/invariants:
  - Must run fully local-first (filesystem + local DB + local embeddings option).
  - Must support bounded, summary-first responses per foundation contracts.
  - Must preserve deterministic defaults and avoid unbounded scans.
  - Must degrade gracefully when optional capabilities (GPU/OpenAI API) are unavailable.

Desired Behavior
- Implement a local MCP server that provides robust semantic retrieval for code and documentation, with hybrid search and self-healing index operations.
- Prioritize AI-agent ergonomics:
  - low-latency context packs
  - stable IDs for chunks/files
  - deterministic pagination and projection
  - explicit health diagnostics and recoverable failure modes
- **Best-in-Class Search & Chunking**:
  - **AST-Aware Parsing & Contextual Chunking**: Understand code structure (functions, classes, methods) to avoid splitting semantic units. Prepend metadata (File, Lang, Class, Fn) to chunks to significantly reduce retrieval failures.
  - **Smart Semantic Chunking for Unstructured Data**: For personal notes, Markdown, and non-code data, use a Semantic Chunker (e.g., **Max-Min algorithm**) that groups sentences by semantic proximity rather than arbitrary character limits.
  - **Hybrid Search with Keyword Boost**: Combine semantic vector search with BM25/FTS. This is critical for finding exact variables or dates in personal notes, while vector search handles conceptual queries. Emphasizes exact technical terms (e.g., `useEffect`, specific error codes) to prevent them from being lost in semantic "fuzziness".
  - **Quality Filtering by Relevance Gaps**: Group results by noticeable drops in similarity scores ("relevance gaps") rather than arbitrary top-K cutoffs, providing fewer but more trustworthy results.
- **Scalable Two-Phase Indexing**:
  - **Phase 1 (Background Discovery & Parsing)**: A dedicated background service that asynchronously scans the file tree, calculates hashes, and parses changed files into a transactional intermediate queue (SQLite). Allows instantaneous detection of changes without blocking the main event loop or immediately paying the embedding cost.
  - **Phase 2 (Embedding Queue Manager)**: A resource-intensive but **resumable** consumer process. Reads un-embedded chunks from SQLite using a priority queue (**User Focus > Recent Changes > Background Sync**), embeds them, and inserts the final records into LanceDB. If interrupted, it resumes exactly where it left off.
- **Parallelism & Batching (Producer-Consumer Model)**:
  - **Asynchronous I/O Parsing**: Utilize Node.js async I/O with bounded concurrency for reading files, avoiding the overhead of heavy `worker_threads` for I/O-bound tasks.
  - **Batch Embedding**: Group chunks (e.g., batches of 100) before sending them to the embedding model. This is essential to minimize API/inference overhead for both local models (Ollama) and remote APIs.
- **Context Expansion**: Support fetching neighbor chunks (`read_chunk_neighbors`) to allow the AI to seamlessly read surrounding text/code for a given result.
- **Multi-Format Support**: Seamlessly ingest PDF, DOCX, TXT, Markdown, and raw HTML alongside source code.
- **Advanced Capabilities**:
  - **AI Code Review**: Context-aware review that analyzes the entire indexed codebase to find patterns, security flaws, and architectural issues, instead of just analyzing git diffs.
  - **Interactive Visualization**: Provide endpoints to generate data for D3.js-powered views (Treemap, Force Graph, Heatmaps) to visualize codebase complexity and relationships.
  - **Smart Reindexing**: Keep the index fresh using search-triggered checks or lightweight Git hooks, reducing the need for heavy background daemons.
- Server must work in fully offline mode using local embedding models.
- **Local LLM Orchestration**: support Ollama for atomic metadata enrichment (summarization, tagging, entity extraction) during indexing and semantic re-ranking during retrieval.
- **Approved Local Model Stack (quality-first default)**:
  - embeddings: `qwen3-embedding:8b` (GPU) or `Transformers.js` (CPU, lightweight zero-setup fallback).
  - chunk metadata enrichment: `granite4:3b-h`
  - query-time reranking and quality-sensitive synthesis: `qwen3.5:9b`
  - this stack is also the minimum supported local profile for v1.
- **Isolation Policy (decision made)**:
  - enforce strict per-project isolation for indexing, storage, and retrieval.
  - do not build or query a cross-project global index in this MCP.
  - rationale: project lifecycles are transient, cross-project indexing increases latency and operational turbulence, and global memory is handled by `MemoryGraph` rather than this local retrieval server.

Tool Catalog
- `health_check`
  - Purpose: report server readiness and critical dependencies.
  - Required args: none.
  - Optional args: `verbose`.
  - Data shape: `{ status, version, index_path, db_backend, embedding_backend, uptime_seconds, warnings[] }`.
- `index_status`
  - Purpose: return index coverage and freshness.
  - Required args: none.
  - Optional args: `project_path`.
  - Data shape: `{ project_path, indexed_files, indexed_chunks, embedded_chunks, last_indexed_at, dirty_estimate, stale_ratio }`.
- `index_project`
  - Purpose: phase 1 parsing/chunking. Index or reindex repository content into chunk store.
  - Required args: `project_path`.
  - Optional args: `force=false`, `include_globs`, `exclude_globs`, `max_file_size_kb`, `follow_symlinks=false`, `enrich=true`.
  - Data shape: `{ files_scanned, files_indexed, chunks_created, chunks_updated, chunks_deleted, enrichment_stats, duration_ms }`.
- `ingest_data`
  - Purpose: Ingest multi-format documents (PDF, DOCX, HTML, Markdown) into the vector database.
  - Required args: `content`, `metadata: { source, format }`.
  - Data shape: `{ ingested_chunks, format, source }`.
- `embed_chunks`
  - Purpose: phase 2 embedding. Generate embeddings incrementally with resumable state and batching.
  - Required args: none.
  - Optional args: `project_path`, `batch_size=100`, `fresh=false`, `backend`, `use_enrichment=true`.
  - Data shape: `{ embedded_new, embedded_updated, enriched_count, skipped, duration_ms, backend_used }`.
- `search_semantic`
  - Purpose: vector similarity search over indexed chunks.
  - Required args: `query`.
  - Optional args: `project_path`, `limit=10`, `offset=0`, `filters`, `similarity_threshold`, `fields`, `summary_only=true`.
  - Data shape: `{ summary, results[], pagination }`.
- `search_keyword`
  - Purpose: BM25/FTS exact+token search.
  - Required args: `query`.
  - Optional args: `project_path`, `limit=10`, `offset=0`, `filters`, `fields`.
  - Data shape: `{ summary, results[], pagination }`.
- `search_hybrid`
  - Purpose: fuse semantic and keyword ranking via Reciprocal Rank Fusion (RRF), with exact keyword boosts.
  - Required args: `query`.
  - Optional args: `project_path`, `limit=10`, `offset=0`, `alpha=0.65`, `rrf_k=60`, `filters`, `fields`, `summary_only=true`.
  - Data shape: `{ summary, strategy_weights, results[], pagination }`.
- `search_similar`
  - Purpose: Find code snippets similar to a specific file or function (contextual search).
  - Required args: `file_path`.
  - Optional args: `function_name`, `limit=10`.
  - Data shape: `{ summary, results[] }`.
- `read_chunk_neighbors`
  - Purpose: Expand context by retrieving chunks immediately before and after a specific hit.
  - Required args: `chunk_id`.
  - Optional args: `before=2`, `after=2`.
  - Data shape: `{ target_chunk, neighbors: { before: [], after: [] } }`.
- `retrieve_context_pack`
  - Purpose: return agent-ready compressed context package for the top relevant files/chunks.
  - Required args: `query`.
  - Optional args: `project_path`, `max_files=8`, `max_chars=12000`, `include_neighbors=true`, `neighbor_hops=1`, `truncate_strategy='middle'`.
  - Data shape: `{ summary, files[], excerpts[], budget, truncated }`.
- `explain_match`
  - Purpose: explain why a chunk matched (keywords, semantic cues, metadata overlap).
  - Required args: `result_id`.
  - Optional args: `verbosity='compact'`.
  - Data shape: `{ result_id, score_breakdown, lexical_hits[], semantic_terms[], filter_hits[] }`.
- `get_chunk`
  - Purpose: fetch one indexed chunk by stable ID.
  - Required args: `chunk_id`.
  - Optional args: `fields`, `max_chars`.
  - Data shape: `{ chunk_id, file_path, start_line, end_line, text, metadata }`.
- `review_codebase`
  - Purpose: Run a context-aware AI code review across the entire indexed project.
  - Required args: `review_type` (security, architecture, performance).
  - Optional args: `changed_only=false`, `max_chunks=30`.
  - Data shape: `{ summary, findings: [{ title, description, severity, file_path, recommendation }] }`.
- `generate_visualization`
  - Purpose: Export codebase relationships and complexity metrics for D3.js rendering (Treemap, Force Graph).
  - Required args: `type` (treemap, force_graph, heatmap).
  - Data shape: `{ type, nodes[], edges[], metadata }`.
- `delete_project_index`
  - Purpose: remove indexed and vector data for one project.
  - Required args: `project_path`.
  - Optional args: `confirm`.
  - Data shape: `{ deleted, files_removed, chunks_removed, vectors_removed }`.
- `doctor_index`
  - Purpose: diagnose corruption/inconsistency and propose safe repair actions.
  - Required args: none.
  - Optional args: `project_path`, `auto_fix=false`.
  - Data shape: `{ healthy, checks[], issues[], auto_fixed[], suggested_actions[] }`.

Architecture (practical for AI Agents)
- Storage layers
  - **Vector & Metadata Store: LanceDB OSS** (preferred backend). Selected for its embedded local-path model, high-performance **IVF-PQ indexing** capabilities, and native support for full-text search (BM25) and hybrid querying.
  - **Schema Versioning**: Utilize LanceDB's schema evolution capabilities to add or modify metadata fields without requiring a full re-indexing of the 50k+ files when the server updates.
  - Disk-Optimized operations: Crucial for scaling to 50k+ files. LanceDB allows vector search streaming directly from disk, preventing Out-of-Memory (OOM) bottlenecks that arise with naive JSON/SQLite+Vector setups.
  - Cache/State: SQLite (`projects`, `index_runs`, `file_fingerprints`).
  - Storage note: LanceDB stores vectors, raw text, and structured metadata in a single table, enabling hardware-accelerated (e.g., Apple MPS) and pipeline-parallelized querying.
- **Intelligence Layer (Local Enrichment & Embeddings)**
  - LLM Backend: Ollama (default).
  - Embedding Model (default): `qwen3-embedding:8b` for GPU or `Transformers.js` for zero-setup CPU environments.
  - **Semantic Enrichment (Pre-vectorization)**: 
    - Before embedding, chunks are optionally processed by `granite4:3b-h`.
    - Task: Generate a concise summary and technical tags (intent, symbols, dependencies).
    - Embedding Strategy: Generate vector from `[Summary] [Tags] [Code Content]`.
  - Re-ranking: use `qwen3.5:9b` for semantic filtering and quality-sensitive synthesis over the top-N results before returning a context pack.
- Retrieval pipeline
  - Query normalization -> optional expansion -> parallel semantic + keyword retrieval -> **RRF fusion with Exact Identifier Boost** -> **Relevance Gap Filtering** -> projection + truncation -> summary-first response.
- Stable identifiers & Freshness
  - `chunk_id = sha256(project_path + file_path + start_line + end_line + content_hash_prefix)`.
  - `metadata.last_commit_hash`: stored for each chunk. Smart Reindexing utilizes search-triggered checks against the git index to invalidate and update stale chunks just-in-time.
- **Two-Phase Indexing & Producer-Consumer Queuing**
  - **Phase 1 (Producers)**: Multiprocess file scanning and AST/Semantic parsing. Rapidly hashes and inserts into intermediate/LanceDB storage.
  - **Phase 2 (Consumers)**: Batching workers (e.g., grouping 100 chunks) pull un-embedded chunks and perform vector embedding. 
  - Incremental indexing strictly compares fingerprints `(path, size, mtime_ns, content_hash)`. Phase 2 ensures resumable execution upon crashes.
- Agent ergonomics
  - `retrieve_context_pack` optimized for token budget and minimal post-processing.
  - `read_chunk_neighbors` allowing proactive expansion of context.
  - deterministic ordering and reproducible pagination.
- Performance defaults
  - max indexed file size default: `512 KB`.
  - AST-Aware chunking: ~120 lines with boundaries snapping to functions/classes using Tree-sitter.
  - Unstructured Data (Semantic chunking): Max-Min algorithm for boundary detection based on sentence embeddings.
  - default top-k candidates before rerank: `50`.

Data/Schema Contracts
- Request controls reuse foundation vocabulary:
  - `limit`, `cursor|offset`, `fields`, `exclude_fields`, `verbosity`, `summary_only`, `max_chars`, `truncate_strategy`, `filters`.
- Response envelope:
  - `summary`, `data`, `pagination`, `window`, `noise_control`, optional `warnings`, optional `source_of_truth='local_index'`.
- Filters schema (minimum)
  - `project_path`, `language`, `file_extensions[]`, `path_prefix`, `updated_after`, `tags[]`, `last_commit_hash`.
- Index boundary rule
  - every indexed record must belong to exactly one `project_path` namespace.
  - retrieval tools must operate within one project namespace at a time.
  - cross-project federation is explicitly out of scope for v1.

Edge Cases
- Empty index: return actionable summary with command hints, never raw stack traces.
- Corrupt vector shard: isolate and re-embed only affected partition if possible.
- Interrupted Indexing: Ensure phase 2 embedding gracefully resumes from the last successfully embedded batch without re-embedding the whole repo.
- Massive files: skip with warning unless explicitly allowed by override.
- Binary/minified files: auto-exclude by heuristic and extension rules.
- Concurrent indexing requests: enforce lock with explicit `lock_owner` + `lock_age` reporting.

Non-Functional Requirements
- Reliability
  - must continue functioning with semantic-only or keyword-only mode if one subsystem fails.
  - crash-safe journaling for index runs, essential for resuming Phase 2 embeddings.
- Security
  - strict local filesystem scope (deny traversal outside allowed roots unless explicitly configured).
  - never execute project code during indexing.
- Observability
  - structured logs with `run_id`, `project_path`, `phase`, `duration_ms`, `warning_count`.
  - tool-level timing and cache-hit metrics.
- Portability
  - Linux-first; must run on developer laptop without Docker. Zero-friction start with `Transformers.js` fallback.

Acceptance Criteria (verifiable)
- Given a fresh repo path, when `index_project` (Phase 1) runs, it extracts chunks fast and exits. When `embed_chunks` (Phase 2) runs, it batches embeddings and if interrupted, resumes without duplicating work.
- Given indexed data, when `search_hybrid` runs with default args, then response is summary-first, bounded, and paginated.
- Given the vector backend is unavailable, when `search_hybrid` runs, then it degrades to keyword mode with explicit warning and non-error result.
- Given changed files, when incremental indexing runs, then unchanged files are not re-chunked and stale chunks are removed.
- Given repeated identical query and unchanged corpus, when `search_hybrid` runs twice, then top-N ordering is deterministic.
- Given a constrained budget, when `retrieve_context_pack` runs with `max_chars`, then returned context respects budget and sets truncation metadata.
- Given an induced corruption scenario, when `doctor_index(auto_fix=true)` runs, then corrupted records are repaired or isolated and status is explicit.
- Given a semantic boundary (like a large class), chunks map logically to the class and don't blindly cut off halfway through a method.

Implementation Plan (for a junior model)
- Step 1: Scaffold server and contracts.
  - Files to touch: `servers/local-memory-search/server.manifest.json`, `src/index.ts`, `src/contracts/*.schema.ts`.
  - Exact change to make: register all tools with shared envelope wrappers.
- Step 2: Build local metadata store & Phase 1 queue.
  - Files to touch: `src/store/sqlite.ts`, `src/store/migrations/*.sql`, `src/store/repositories/*.ts`.
  - Exact change to make: implement projects/files/chunks/index_runs tables and repository methods, including tracking `embedding_status`.
- Step 3: Build Two-Phase chunking/indexer (AST-Aware & Semantic boundaries).
  - Files to touch: `src/indexing/fileScanner.ts`, `src/indexing/astChunker.ts`, `src/indexing/semanticChunker.ts`, `src/indexing/indexProject.ts`.
  - Exact change to make: multiprocess file discovery, AST-aware and Max-Min semantic chunk generation, inserting into un-embedded state.
- Step 4: Build resumable embedding adapters (Phase 2).
  - Files to touch: `src/embedding/transformersJsAdapter.ts`, `src/embedding/openaiAdapter.ts`, `src/embedding/ollamaAdapter.ts`, `src/embedding/embedChunks.ts`.
  - Exact change to make: local-first embedding backend implementing the Consumer model. Batch chunks (default: 100), commit vectors to LanceDB, and update status. Ensure it is resumable.
- Step 5: Build retrieval engines.
  - Files to touch: `src/search/semantic.ts`, `src/search/keywordFts.ts`, `src/search/hybridRrf.ts`, `src/search/contextPack.ts`, `src/search/neighbors.ts`.
  - Exact change to make: vector, keyword, fused retrieval with Relevance Gap Filtering, exact technical term boosts, and `read_chunk_neighbors` support.
- Step 6: Build resilience and diagnostics.
  - Files to touch: `src/health/doctor.ts`, `src/locks/indexLock.ts`, `src/health/status.ts`.
  - Exact change to make: lock handling, consistency checks, auto-fix flow, warning-first error model.
- Step 7: Add tests and fixtures.
  - Files to touch: `tests/indexing/*.test.ts`, `tests/search/*.test.ts`, `tests/health/*.test.ts`, `tests/fixtures/repos/*`.
  - Exact change to make: deterministic search tests, resumable embedding tests, batching tests, AST-aware boundaries tests.
- Risks & Mitigations
  - Risk: AST parsing is slow across massive codebases.
  - Mitigation: Cache AST parsed trees, use multiprocessing, and fallback to semantic chunking if parsing times out.
  - Risk: LanceDB concurrent writes issues.
  - Mitigation: Isolate LanceDB writes inside the batch embedding consumer loop to prevent lock contention.
  - Risk: indexing large repos can be slow on laptops.
  - Mitigation: two-phase indexing ensures quick startup; parallel scanning limits duration; batching minimizes embedding calls.

File/Code Touchpoints (assumptions)
- `[server.manifest.json](/home/sr/Projects/Workspace/agent-forge/servers/local-memory-search/server.manifest.json)` - new; server manifest and tool registry metadata.
- `[index.ts](/home/sr/Projects/Workspace/agent-forge/servers/local-memory-search/src/index.ts)` - new; MCP server entrypoint.
- `[sqlite.ts](/home/sr/Projects/Workspace/agent-forge/servers/local-memory-search/src/store/sqlite.ts)` - new; DB initialization and connection lifecycle.
- `[astChunker.ts](/home/sr/Projects/Workspace/agent-forge/servers/local-memory-search/src/indexing/astChunker.ts)` - new; AST and topic-based deterministic chunking strategy.
- `[textChunker.ts](/home/sr/Projects/Workspace/agent-forge/servers/local-memory-search/src/indexing/textChunker.ts)` - new; Structural chunking (Markdown/paragraphs) for unstructured text.
- `[hybridRrf.ts](/home/sr/Projects/Workspace/agent-forge/servers/local-memory-search/src/search/hybridRrf.ts)` - new; rank fusion logic with exact keyword boosts.
- `[embedChunks.ts](/home/sr/Projects/Workspace/agent-forge/servers/local-memory-search/src/embedding/embedChunks.ts)` - new; resumable batch-embedding consumer loop.
- `[doctor.ts](/home/sr/Projects/Workspace/agent-forge/servers/local-memory-search/src/health/doctor.ts)` - new; integrity checks and repair actions.
- `[hybrid.search.test.ts](/home/sr/Projects/Workspace/agent-forge/servers/local-memory-search/tests/search/hybrid.search.test.ts)` - new; deterministic retrieval behavior.

Tests & Verification
- What tests to add/update
  - migration and repository tests for SQLite schema
  - incremental indexing correctness tests, specifically Phase 2 resumability.
  - semantic/keyword/hybrid ranking tests with exact term boost
  - `retrieve_context_pack` token-budget compliance tests
  - `doctor_index` corruption and recovery tests
- Commands to run
  - `pnpm --filter local-memory-search test`
  - `pnpm --filter local-memory-search typecheck`
  - `pnpm --filter local-memory-search lint`
- Manual verification scenario
  - Index this repo with `qwen3-embedding:8b` + `granite4:3b-h`. Stop the embedding phase halfway, restart, and verify it resumes from where it left off without duplicating chunks. Run `search_hybrid("workflow aliases bashrc")`, then run `retrieve_context_pack` with `qwen3.5:9b` reranking enabled and verify bounded coherent context.
  - Simulate vector backend failure (disable model dependency) and verify keyword fallback with warnings.

Future Work
- Agent skill / workflow guide for the two MCP servers. Tool descriptions explain *what* each tool does but not *when* to use it. An agent left without guidance will guess the order of operations. A short skill file (or CLAUDE.md-style prompt) should codify the recommended workflow:
  1. Check index exists and is fresh → `index_status`
  2. Search by default → `search_hybrid`
  3. Expand context around a hit → `read_chunk_neighbors`
  4. Need a ready-made token-budgeted package → `retrieve_context_pack`
  Specific gaps to address: (a) `search_hybrid` should be marked as the default over `search_semantic`/`search_keyword`; (b) `retrieve_context_pack` vs `search_hybrid` distinction (ready context vs targeted lookup) needs an explicit example.
- Knowledge graph (call graph / dependency graph) — Spec 8.1 stores flat AST metadata (language, function_name, class_name) but does not build edges between symbols. Planned as two sub-specs:
  - **8.1.1** — indexer extension: during AST chunking, extract edges (callers/callees, import relationships); add `nodes` and `edges` tables to SQLite; store symbol-level provenance per chunk.
  - **8.2.1** — search extension: new read-only MCP tools (`find_callers`, `find_callees`, `get_import_graph`, `trace_path`); optionally integrate graph traversal as a post-search step to surface related symbols after a vector hit.

Rollout / Migration (if needed)
- Ship as optional Spec 08 extension after foundation and core Drupal servers.
- Keep tool names and contracts stable from first release to avoid prompt churn for agents.
- Add opt-in routing rule in orchestration layer: use local server as default fallback when remote vector MCP health is degraded.

Model Recommendation
- Target execution model: gpt-5.2-codex
- Why
  - This server combines storage design, retrieval ranking, deterministic behavior, and fault-tolerant operations (two-phase resumable indexing).
  - The implementation has architecture-sensitive choices (index consistency, lock semantics, degradation paths) that are risky to under-specify.
  - Agent ergonomics (`retrieve_context_pack`, deterministic top-N, bounded responses) require careful end-to-end design, not just tool stubs.
- Confidence: High
- If gpt-5.2-codex: specify what could not be simplified to gpt-5-mini safely.
  - Corruption recovery, lock coordination, multiprocess phase 1, resumable batch embedding (phase 2), and local/offline degradation paths are not safe to leave to a junior execution model without strong architectural guidance.rchitectural guidance.ion paths are not safe to leave to a junior execution model without strong architectural guidance.unior execution model without strong architectural guidance.