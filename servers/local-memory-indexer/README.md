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

## 🛡️ Security

This server reads files under the requested `project_path` and writes index
data to the local data root. It never executes project code. Only use it on
projects you trust and only with absolute paths you control.

## 🧰 Available Tools (6)

| Tool | Purpose |
|---|---|
| `start_indexing` | Start a discovery and/or embedding run for a project. Returns `run_id` immediately. |
| `get_indexing_status` | Poll progress, ETA, chunk counts, and warnings for a run. |
| `pause_indexing` | Gracefully pause Phase 2 embedding; checkpoint in SQLite. |
| `resume_indexing` | Resume paused Phase 2 embedding from a SQLite checkpoint. |
| `doctor_index` | Diagnose SQLite/LanceDB/FTS/fingerprint consistency and optionally repair safe issues. |
| `delete_project_index` | Delete all index data (SQLite + LanceDB) for a project. |

### `start_indexing`

| Parameter | Type | Default | Description |
|---|---|---|---|
| `project_path` | string | *(required)* | Absolute path to the project root. |
| `phases` | string[] | `["discovery","embedding"]` | Run `"discovery"` only, `"embedding"` only, or both. |
| `force` | boolean | `false` | Re-index all files; ignore change fingerprints. |
| `include_globs` | string[] | — | Glob allowlist; index only matching paths (e.g. `["src/**/*.ts"]`). |
| `exclude_globs` | string[] | — | Extra globs to exclude beyond built-in defaults. |
| `max_file_size_kb` | integer | `512` | Skip files larger than this (KB). |
| `batch_size` | integer | `20` | Phase 2 embedding batch size. |
| `enrich` | boolean | `true` | Generate chunk summary + tags via LLM before embedding. |
| `backend` | enum | `"auto"` | Embedding backend: `"ollama"`, `"transformers_js"`, or `"auto"`. |
| `priority` | enum | `"background"` | Embedding queue priority: `"user_focus"`, `"recent"`, or `"background"`. |

### `get_indexing_status`

| Parameter | Type | Description |
|---|---|---|
| `run_id` | string | Specific `run_id` from `start_indexing`. |
| `project_path` | string | With `run_id` omitted: latest run for this project path. |

Provide at least one of `run_id` or `project_path`.

### `pause_indexing`

| Parameter | Type | Description |
|---|---|---|
| `run_id` | string | *(required)* `run_id` from `start_indexing`. |

### `resume_indexing`

| Parameter | Type | Description |
|---|---|---|
| `run_id` | string | *(required)* Paused `run_id` from `pause_indexing`. |
| `project_path` | string | Absolute project root; required after server restart if run not in memory. |

### `doctor_index`

| Parameter | Type | Default | Description |
|---|---|---|---|
| `project_path` | string | *(required)* | Absolute project root path. |
| `auto_fix` | boolean | `false` | Auto-repair safe issues: schema drift, stale chunks, FTS, queue errors. |

### `delete_project_index`

| Parameter | Type | Description |
|---|---|---|
| `project_path` | string | *(required)* Absolute project root whose index to delete. |

## 🤖 Default Local Model Stack

- embeddings: `qwen3-embedding:4b` via Ollama, with `Transformers.js` CPU fallback
- chunk enrichment: `granite4.1:3b` via Ollama

> [!NOTE]
> This server stack is optimized to run smoothly on local setups, including laptop GPUs with 4 GB of VRAM.

The search server must use the **same embedding model** that produced the index.

## 🚀 Installation & Configuration

Ensure Ollama is running and the embedding model is pulled:
```bash
ollama pull qwen3-embedding:4b
ollama pull granite4.1:3b   # optional, for chunk enrichment
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
| `EMBED_MODEL` | `qwen3-embedding:4b` | Embedding model override. |
| `ENRICH_MODEL` | `granite4.1:3b` | Chunk enrichment model override. |
| `MAX_FILE_SIZE_KB` | `512` | Default max file size for scanning. |

Indexed data layout per project:

```
$LOCAL_VECTOR_SEARCH_DATA_ROOT/<project-slug>/
  state.db      # SQLite: runs, queue, fingerprints, stats
  lancedb/      # LanceDB vector + FTS tables
```

### Via npm (Recommended)

1. Install the server globally:
   ```bash
   npm install -g @local-memory/indexer
   ```

2. Add the following to your MCP client configuration (e.g., `claude_desktop_config.json` or Cursor settings):
   ```json
   {
     "mcpServers": {
       "local-memory-indexer": {
         "command": "npx",
         "args": [
           "-y",
           "@local-memory/indexer"
         ],
         "env": {
           "LOCAL_VECTOR_SEARCH_DATA_ROOT": "/home/you/.agent-forge/local-memory-search",
           "OLLAMA_BASE_URL": "http://127.0.0.1:11434"
         }
       }
     }
   }
   ```

## 🎬 Exploratory Demo Scenario

Follow this step-by-step developer journey to explore how the server builds, monitors, pauses, resumes, validates, and cleans up local semantic indexes. You can execute these tools sequentially to experience the indexer's features in action.

### 1. Resetting with a Clean Slate

Before building a new index, let's ensure we are starting with a clean slate. We'll use the cleanup tool to remove any pre-existing index data for our project:

- **Tool:** `delete_project_index`
- **Parameters:**
  ```json
  {
    "project_path": "/absolute/path/to/your-project"
  }
  ```
- **Insight:** The server deletes both the LanceDB vector database and the SQLite checkpoint database under the project-specific data directory, freeing up storage and ensuring a clean environment.

### 2. Initializing the Indexing Pipeline

Now, let's start the indexing pipeline. The indexer works in two phases: *discovery* (scanning and parsing files) and *embedding* (generating and saving vectors). It operates asynchronously to keep your workflow unblocked:

- **Tool:** `start_indexing`
- **Parameters:**
  ```json
  {
    "project_path": "/absolute/path/to/your-project",
    "phases": ["discovery", "embedding"],
    "enrich": true
  }
  ```
- **Insight:** The tool immediately returns a unique `run_id` and the list of queued phases. Under the hood, the server initiates an AST-aware parser and starts enqueueing chunks for embedding.

### 3. Observing Real-Time Progress

Since indexing runs in the background, you can inspect the process state in real-time:

- **Tool:** `get_indexing_status`
- **Parameters:**
  ```json
  {
    "run_id": "YOUR_RUN_ID"
  }
  ```
- **Insight:** You will receive live metrics showing the number of files discovered, chunks generated, progress percentage, estimated time of arrival (ETA), and any warning flags.

### 4. Suspending the Run

If you are running a large indexing job and want to temporarily free up CPU or GPU resources, you can gracefully pause the embedding phase:

- **Tool:** `pause_indexing`
- **Parameters:**
  ```json
  {
    "run_id": "YOUR_RUN_ID"
  }
  ```
- **Insight:** The indexer stops processing new embedding batches and saves its exact progress state as a checkpoint in the SQLite queue database.

### 5. Resuming from Checkpoints

Once resources are free, you can pick up indexing exactly where it was suspended without starting over:

- **Tool:** `resume_indexing`
- **Parameters:**
  ```json
  {
    "run_id": "YOUR_RUN_ID",
    "project_path": "/absolute/path/to/your-project"
  }
  ```
- **Insight:** The server reads the SQLite checkpoint queue, matches it with the files already embedded, and resumes embedding the remaining chunks.

### 6. Diagnosing and Repairing Index Health

To ensure your index is healthy, consistent, and optimized, you can perform a self-diagnostic check:

- **Tool:** `doctor_index`
- **Parameters:**
  ```json
  {
    "project_path": "/absolute/path/to/your-project",
    "auto_fix": true
  }
  ```
- **Insight:** This runs checks against SQLite queue states, LanceDB vector collections, Full-Text Search (FTS) indexes, and file change fingerprints. Setting `auto_fix: true` lets the server automatically repair any safe issues (like minor database drift or stale entries).
