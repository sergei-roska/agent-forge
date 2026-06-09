# 📇 Local Memory Indexer (Spec 08.1)

The **write-only producer** half of the local agent-memory system. It discovers
project files, AST/semantic-chunks them, enriches metadata, and embeds vectors
into LanceDB for retrieval by the companion **`local-memory-search`** server
(Spec 08.2).

Indexing is **fire-and-forget**: `start_indexing` returns immediately with a
`run_id`; poll `get_indexing_status` for progress. Runs are resumable across
process restarts via a SQLite checkpoint queue.

## ✨ Design Highlights

- **Two-phase pipeline** — Phase 1 (*discovery*) scans files, fingerprints
  changes, and enqueues chunks in SQLite. Phase 2 (*embedding*) batches vectors
  into LanceDB. Either phase can run alone.
- **Per-project isolation** — each `project_path` gets its own LanceDB +
  SQLite data directory under a shared data root. No cross-project federation.
- **Incremental by default** — content fingerprints skip unchanged files unless
  `force=true`.
- **AST-aware chunking** — Tree-sitter for code; semantic chunking for docs
  (Markdown, PDF, DOCX).
- **Concurrency lock** — only one active run per project; duplicate
  `start_indexing` calls return the existing `run_id`.
- **Graceful pause** — `pause_indexing` finishes the current embedding batch,
  checkpoints state, and allows resumption via `start_indexing`.

## 🧰 Available Tools (3)

| Tool | Purpose |
|---|---|
| `start_indexing` | Start a discovery and/or embedding run for a project. Returns `run_id` immediately. |
| `get_indexing_status` | Poll progress, ETA, chunk counts, and warnings for a run. |
| `pause_indexing` | Gracefully pause Phase 2 embedding; resume later with `start_indexing`. |

### `start_indexing`

| Parameter | Type | Default | Description |
|---|---|---|---|
| `project_path` | string | *(required)* | Absolute path to the project root. |
| `phases` | string[] | `["discovery","embedding"]` | Run `"discovery"` only, `"embedding"` only, or both. |
| `force` | boolean | `false` | Re-index all files regardless of fingerprint. |
| `include_globs` | string[] | — | Allowlist globs (e.g. `["src/**/*.ts"]`). |
| `exclude_globs` | string[] | — | Additional exclusion globs. |
| `max_file_size_kb` | integer | `512` | Skip files larger than this. |
| `batch_size` | integer | `100` | Embedding batch size for Phase 2. |
| `enrich` | boolean | `true` | Generate chunk summary + tags via LLM before embedding. |
| `backend` | enum | `"auto"` | `"ollama"`, `"transformers_js"`, or `"auto"`. |
| `priority` | enum | `"background"` | `"user_focus"`, `"recent"`, or `"background"`. |

### `get_indexing_status`

| Parameter | Type | Description |
|---|---|---|
| `run_id` | string | Specific run to inspect. |
| `project_path` | string | When `run_id` is omitted, returns the most recent run for this project. |

Provide at least one of `run_id` or `project_path`.

### `pause_indexing`

| Parameter | Type | Description |
|---|---|---|
| `run_id` | string | *(required)* Run to pause. |

## 🤖 Default Local Model Stack

- embeddings: `qwen3-embedding:8b` via Ollama, with `Transformers.js` CPU fallback
- chunk enrichment: `granite4:3b-h` via Ollama

The search server must use the **same embedding model** that produced the index.

## 🚀 Quick Start (Forge)

```bash
# From the root of agent-forge
pnpm install
pnpm --filter @agent-forge/server-local-memory-indexer build
pnpm --filter @agent-forge/server-local-memory-indexer test
```

Ensure Ollama is running and the embedding model is pulled:

```bash
ollama pull qwen3-embedding:8b
ollama pull granite4:3b-h   # optional, for chunk enrichment
```

Typical workflow:

```
start_indexing(project_path: "/abs/path/to/project")
  → get_indexing_status(project_path: "/abs/path/to/project")   # poll until completed
  → configure local-memory-search and query the index
```

## 🔋 Environment Variables

| Variable | Default | Description |
|---|---|---|
| `LOCAL_VECTOR_SEARCH_DATA_ROOT` | `~/.agent-forge/local-memory-search` | Shared data root (must match the search server). |
| `LOCAL_VECTOR_SEARCH_DEFAULT_PROJECT` | `process.cwd()` | Default `project_path` when omitted by downstream tools. |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Ollama base URL. |
| `EMBED_MODEL` | `qwen3-embedding:8b` | Embedding model override. |
| `ENRICH_MODEL` | `granite4:3b-h` | Chunk enrichment model override. |
| `MAX_FILE_SIZE_KB` | `512` | Default max file size for scanning. |

Indexed data layout per project:

```
$LOCAL_VECTOR_SEARCH_DATA_ROOT/<project-slug>/
  state.db      # SQLite: runs, queue, fingerprints, stats
  lancedb/      # LanceDB vector + FTS tables
```

## 🛠 MCP Client Configuration

### Claude Desktop / Cursor (`mcp.json`)

```json
{
  "mcpServers": {
    "local-memory-indexer": {
      "command": "node",
      "args": [
        "/absolute/path/to/agent-forge/servers/local-memory-indexer/dist/index.js"
      ],
      "env": {
        "LOCAL_VECTOR_SEARCH_DATA_ROOT": "/home/you/.agent-forge/local-memory-search",
        "OLLAMA_BASE_URL": "http://127.0.0.1:11434"
      }
    },
    "local-memory-search": {
      "command": "node",
      "args": [
        "/absolute/path/to/agent-forge/servers/local-memory-search/dist/index.js"
      ],
      "env": {
        "LOCAL_VECTOR_SEARCH_DATA_ROOT": "/home/you/.agent-forge/local-memory-search"
      }
    }
  }
}
```

Replace paths with the actual absolute paths to your built `dist/index.js` files.
Both servers **must share the same** `LOCAL_VECTOR_SEARCH_DATA_ROOT`.

## 🧪 AI Agent Verification & Stress Test

If you are an AI agent tasked with verifying this server, follow this protocol
strictly:

### 🎯 Objective

Validate that indexing produces a searchable LanceDB index and that runs are
resumable and observable.

### 🛠 Sequential Testing Protocol

One tool at a time. Use a small test project with a few source files.

1. **`start_indexing`**: Run with `project_path` set to an absolute project
   root. Confirm immediate return with a `run_id` and `phases` array.
2. **`get_indexing_status`**: Poll until `status` is `completed`. Verify
   `files_discovered`, `chunks_embedded`, and a progress bar during the run.
3. **`pause_indexing`** *(optional)*: Start a large run, pause mid-embedding,
   confirm `status: paused`, then resume with `start_indexing` on the same
   project.
4. **Hand off to search**: Run `health_check` on `local-memory-search` for the
   same `project_path` and confirm `lancedb_available: true`.

### 📝 Evaluation Criteria

For each step:

- **Isolation**: Does indexing stay within the requested `project_path`?
- **Resumability**: After pause or process restart, does embedding continue
  from the checkpoint?
- **Idempotency**: Does a second `start_indexing` without `force` skip
  unchanged files?

**Produce an "Indexing Run Audit" before querying via the search server.**

## 🛡️ Security

This server reads files under the requested `project_path` and writes index
data to the local data root. It never executes project code. Only use it on
projects you trust and only with absolute paths you control.
