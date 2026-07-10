# 🧠 Local Memory Search (Spec 08.2)

The **read-only consumer** half of the local agent-memory system. It exposes the
agent's primary retrieval interface — hybrid search, context packs, chunk
navigation, and health diagnostics — over the LanceDB index produced by the
companion **`local-memory-indexer`** (Spec 08.1).

It runs in **strict read-only mode**: it never writes to LanceDB, never mutates
the SQLite state DB, and never writes to the filesystem. This guarantees agent
search latency is never impacted by background indexing writes.

## ✨ Features

- **Strict read-only enforcement** — LanceDB tables are wrapped in a Proxy that
  throws `READONLY_VIOLATION` on any mutating call; SQLite is opened
  `readonly` + `PRAGMA query_only = ON`.
- **Hybrid retrieval** — parallel vector ANN + BM25/FTS fused with Reciprocal
  Rank Fusion, an exact-identifier boost, recency boost, and relevance-gap
  filtering.
- **Graceful degradation, never an error** — every tool returns a usable result
  set with a `warnings[]` array. The cascade is: lock → brute-force ANN → FTS →
  SQLite `LIKE`; embedding down → keyword-only (`alpha=0`); LanceDB missing →
  SQLite fallback.
- **Per-project isolation** — every query is filtered by `project_path` **and**
  `schema_version`; no cross-project federation.
- **Agent-ready context packs** — token-budgeted excerpts with optional neighbor
  expansion and optional `granite4.1:3b` LLM re-ranking.

## 🧰 Available Tools (15, read-only)

| Tool | Purpose |
|---|---|
| `search_hybrid` | Primary hybrid (vector + BM25/RRF) search. |
| `search_semantic` | Pure vector ANN search. |
| `search_keyword` | Pure BM25/FTS keyword search. |
| `retrieve_context_pack` | Token-budgeted context pack with neighbor expansion + optional re-rank. |
| `read_chunk_neighbors` | Adjacent chunks before/after a hit. |
| `get_chunk` | Fetch one chunk by stable `chunk_id`. |
| `search_similar` | Find chunks similar to a file/function via its stored vector. |
| `explain_match` | Score breakdown: vector, FTS, identifier boost, recency. |
| `health_check` | Readiness: LanceDB, embedding backend, FTS, `schema_version`. |
| `index_status` | Indexed file/chunk counts, freshness, stale ratio. |
| `doctor_index` | Diagnose schema/FTS/count inconsistencies (read-only; suggests actions). |
| `find_callers` | List symbols that call symbol_name (call-graph upstream). |
| `find_callees` | List symbols called by symbol_name (call-graph downstream). |
| `get_import_graph` | List import/dependency edges. Omit file_path for project-wide graph. |
| `trace_path` | Find call chain from source_symbol to target_symbol. |

> `delete_project_index` is **intentionally not exposed** — delete operations
> belong exclusively to the indexer process.

### Common search parameters

Most search tools (`search_hybrid`, `search_semantic`, `search_keyword`) accept:

| Parameter | Type | Default | Description |
|---|---|---|---|
| `project_path` | string | env default | Absolute path to the indexed project root. |
| `query` | string | *(required)* | Search text: identifiers, keywords, or natural language. |
| `limit` | integer | `10` | Max results (1–50). |
| `offset` | integer | `0` | Skip N results (pagination offset). |
| `max_chars` | integer | `800` | Truncate each chunk text in results. |
| `summary_only` | boolean | `false` | Return summaries only; omit chunk text. |
| `filters` | object | — | Pre-filter hits before ranking (see keys below). |
| `fields` | array of strings | — | Include only these chunk fields in response. |
| `exclude_fields` | array of strings | — | Omit these fields from the default set. |
| `recency_weight` | number | `0.1` | Recency boost weight. Use `0` to disable. |
| `gap_threshold` | number | `0.25` | Drop hits below this relevance-gap ratio. |
| `cache_bust` | boolean | `false` | Bypass result cache. |

`search_hybrid` additionally accepts:
- `alpha` (number, default `0.65`): RRF semantic weight (`0` = keyword-only, `1` = semantic-only).
- `rrf_k` (integer, default `60`): RRF k constant.

#### Metadata Filters (`filters` object)

The `filters` object is strictly validated. The supported keys (all optional) are:
- `language` (string): Language tag, e.g. `typescript`.
- `file_extensions` (array of strings): Extensions without dot, e.g. `["ts", "py"]`.
- `path_prefix` (string): Repo-relative path prefix.
- `updated_after` (string): ISO 8601 datetime; keep chunks newer than this.
- `tags` (array of strings): Match any listed tag.
- `class_name` (string): Exact class name.
- `function_name` (string): Exact function/method name.
- `last_commit_hash` (string): Exact git commit hash.

> [!NOTE]
> Keys like `file_path` and `chunk_kind` are NOT supported inside the `filters` object.

### Context & diagnostics highlights

- **`retrieve_context_pack`** — Excerpt pack for LLM prompts. Accepts:
  - `query` (string, required): Search query.
  - `project_path` (string, optional)
  - `max_files` (integer, default `8`): Max distinct files.
  - `max_chars` (integer, default `12000`): Total char budget for all excerpts.
  - `include_neighbors` (boolean, default `true`): Append adjacent chunks.
  - `neighbor_hops` (integer, default `1`): Expansion depth (0–3).
  - `rerank` (boolean, default `false`): LLM rerank via `granite4.1:3b`.
  - `truncate_strategy` (enum: `"middle" | "tail" | "head"`, default `"middle"`).
  - `filters` (object, optional): Pre-filter hits.
  - `alpha` (number, default `0.65`).
- **`read_chunk_neighbors`** — Load adjacent chunks before/after. Accepts:
  - `chunk_id` (string, required)
  - `project_path` (string, optional)
  - `before` (integer, default `2`, max 5)
  - `after` (integer, default `2`, max 5)
- **`get_chunk`** — Fetch a single chunk. Accepts:
  - `chunk_id` (string, required)
  - `project_path` (string, optional)
  - `fields` (array of strings, optional)
  - `max_chars` (integer, default `0` = no truncation)
- **`search_similar`** — Vector similarity based on file/function vector. Accepts:
  - `file_path` (string, required): Repo-relative file path of seed chunk.
  - `project_path` (string, optional)
  - `function_name` (string, optional): Restrict seed to this function/method.
  - `limit` (integer, default `10`)
  - `filters` (object, optional)
  - `max_chars` (integer, default `800`)
- **`explain_match`** — Score breakdown for ranking. Accepts:
  - `query` (string, required)
  - `result_id` (string, required): `chunk_id` to explain.
  - `project_path` (string, optional)
  - `alpha` (number, default `0.65`)
  - `verbosity` (enum: `"compact" | "full"`, default `"compact"`)
- **`health_check`** — Check system readiness. Accepts:
  - `project_path` (string, optional)
  - `verbose` (boolean, default `false`): Include capabilities and diagnostics.
- **`index_status`** — Report counts. Accepts `project_path` (string, optional).
- **`doctor_index`** — Diagnose inconsistencies. Accepts `project_path` (string, optional) and `auto_fix` (boolean, default `false`, no-op here).

### Call Graph & Import Tools

- **`find_callers`** — List symbols calling the target symbol. Accepts:
  - `symbol_name` (string, required): Callee symbol to reverse-lookup.
  - `project_path` (string, optional)
  - `depth` (integer, default `1`, max 3): Hop depth.
- **`find_callees`** — List symbols called by target symbol. Accepts:
  - `symbol_name` (string, required): Caller symbol.
  - `project_path` (string, optional)
  - `depth` (integer, default `1`, max 3)
- **`get_import_graph`** — List import/dependency edges. Accepts:
  - `file_path` (string, optional): Repo-relative path; omit for project-wide.
  - `project_path` (string, optional)
- **`trace_path`** — Find call chain between symbols. Accepts:
  - `source_symbol` (string, required): Start symbol name or qualified path.
  - `target_symbol` (string, required): End symbol name or qualified path.
  - `project_path` (string, optional)

## 🤖 Default Local Model Stack

- embeddings: `qwen3-embedding:4b` (must match the model the indexer used), with
  a `Transformers.js` CPU fallback.
- query-time re-ranking: `granite4.1:3b`.

> [!NOTE]
> This server's query embedding timeout has been optimized (increased to 30s) to allow seamless model swapping on laptop GPUs with 4 GB of VRAM.

## 🚀 Installation & Configuration

Ensure Ollama is running and the embedding model is pulled:
```bash
ollama pull qwen3-embedding:4b
```

Index a project first via **`local-memory-indexer`**, then query here.

## 🔋 Environment Variables

| Variable | Default | Description |
|---|---|---|
| `LOCAL_VECTOR_SEARCH_DATA_ROOT` | `~/.agent-forge/local-memory-search` | Shared data root (must match the indexer). |
| `LOCAL_VECTOR_SEARCH_DEFAULT_PROJECT` | `process.cwd()` | Default `project_path` when omitted. |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Ollama base URL. |
| `EMBED_MODEL` | `qwen3-embedding:4b` | Query embedding model (must match indexer). |
| `RERANK_MODEL` | `granite4.1:3b` | LLM re-ranker for `retrieve_context_pack`. |

### Via npm (Recommended)

1. Install the servers globally:
   ```bash
   npm install -g @local-memory/indexer @local-memory/search
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
    },
    "local-memory-search": {
      "command": "npx",
      "args": [
        "-y",
        "@local-memory/search"
      ],
      "env": {
        "LOCAL_VECTOR_SEARCH_DATA_ROOT": "/home/you/.agent-forge/local-memory-search",
        "OLLAMA_BASE_URL": "http://127.0.0.1:11434"
      }
    }
  }
}
```

Both servers **must share the same** `LOCAL_VECTOR_SEARCH_DATA_ROOT`.

The frozen contract version is **1.0** (`server.manifest.json` →
`contract_frozen`). Tool names, required params, and the envelope shape must not
change without a version bump.

## 🎬 Exploratory Demo Scenario

Follow this step-by-step developer journey to explore the retrieval, code-navigation, call-graph analysis, and system diagnostics features of the Local Memory Search server. This demo showcases how to discover patterns, inspect code structure, and assemble contextual bundles for LLMs.

### 1. Verification of System Readiness and Index Status

Before you start querying the codebase, let's verify that the local search server is ready and examine the metadata of your indexed project.

- **Tool:** `health_check`
  - **Parameters:**
    ```json
    {
      "project_path": "/absolute/path/to/your-project",
      "verbose": true
    }
    ```
  - **Insight:** You will receive a breakdown of system readiness, including status checks for LanceDB, the embedding models, and version constraints.

- **Tool:** `index_status`
  - **Parameters:**
    ```json
    {
      "project_path": "/absolute/path/to/your-project"
    }
    ```
  - **Insight:** This tool returns the volume of indexed code chunks, file counts, and indexing freshness, so you know exactly what is available for retrieval.

---

### 2. Exploring Code with Queries

Now, let's search the codebase using different strategies to find relevant sections.

- **Tool:** `search_keyword`
  - **Parameters:**
    ```json
    {
      "project_path": "/absolute/path/to/your-project",
      "query": "initializeDatabase"
    }
    ```
  - **Insight:** This performs a pure keyword search across the codebase using Full-Text Search (FTS). It is ideal for finding exact identifiers or function names.

- **Tool:** `search_semantic`
  - **Parameters:**
    ```json
    {
      "project_path": "/absolute/path/to/your-project",
      "query": "how do we handle database connections and errors?"
    }
    ```
  - **Insight:** This performs a vector-based semantic search. It captures conceptual intent, finding code blocks that relate to the topic even if they do not share the exact query keywords.

- **Tool:** `search_hybrid`
  - **Parameters:**
    ```json
    {
      "project_path": "/absolute/path/to/your-project",
      "query": "database connection retry logic",
      "alpha": 0.65
    }
    ```
  - **Insight:** The hybrid search fuses vector search and BM25 keywords using Reciprocal Rank Fusion (RRF). It provides the best of both worlds by prioritizing exact matches while matching semantic concepts.

- **Tool:** `explain_match`
  - **Parameters:**
    ```json
    {
      "project_path": "/absolute/path/to/your-project",
      "query": "database connection retry logic",
      "result_id": "CHUNKS_STABLE_ID"
    }
    ```
  - **Insight:** If you want to understand how a particular chunk got ranked, this tool breaks down the final score, showing the exact contributions from the vector match, FTS score, identifier boost, and recency boost.

---

### 3. Navigating and Deep-Diving into Code Chunks

Once you find a promising chunk, you can navigate surrounding code and search for structurally similar elements.

- **Tool:** `get_chunk`
  - **Parameters:**
    ```json
    {
      "project_path": "/absolute/path/to/your-project",
      "chunk_id": "CHUNKS_STABLE_ID"
    }
    ```
  - **Insight:** Retrieves a single code chunk in its entirety, bypassing length limits applied to standard search results.

- **Tool:** `read_chunk_neighbors`
  - **Parameters:**
    ```json
    {
      "project_path": "/absolute/path/to/your-project",
      "chunk_id": "CHUNKS_STABLE_ID",
      "before": 2,
      "after": 2
    }
    ```
  - **Insight:** Fetches neighboring chunks within the source file, allowing you to reconstruct the context before and after the matched code.

- **Tool:** `search_similar`
  - **Parameters:**
    ```json
    {
      "project_path": "/absolute/path/to/your-project",
      "file_path": "src/database/connection.ts",
      "function_name": "connect"
    }
    ```
  - **Insight:** Finds other chunks in the project that are structurally or semantically similar to this seed function, letting you discover patterns or duplicate logic elsewhere.

---

### 4. Mapping Call Graphs and Dependency Relations

Let's understand how different files and symbols interact by exploring the project's dependency structure and call flows.

- **Tool:** `get_import_graph`
  - **Parameters:**
    ```json
    {
      "project_path": "/absolute/path/to/your-project"
    }
    ```
  - **Insight:** Generates the project-wide import/dependency graph (or filters to a specific file), highlighting code-level relationships across the project.

- **Tool:** `find_callers`
  - **Parameters:**
    ```json
    {
      "project_path": "/absolute/path/to/your-project",
      "symbol_name": "connect",
      "depth": 2
    }
    ```
  - **Insight:** Traces which functions or methods call the target symbol up to a specified depth, helping you trace usage patterns.

- **Tool:** `find_callees`
  - **Parameters:**
    ```json
    {
      "project_path": "/absolute/path/to/your-project",
      "symbol_name": "connect",
      "depth": 2
    }
    ```
  - **Insight:** Traces the symbols that the target function calls, giving you an immediate view of its downstream dependencies.

- **Tool:** `trace_path`
  - **Parameters:**
    ```json
    {
      "project_path": "/absolute/path/to/your-project",
      "source_symbol": "main",
      "target_symbol": "connect"
    }
    ```
  - **Insight:** Attempts to find a direct call path from `source_symbol` to `target_symbol`, tracing a call chain across the code graph.

---

### 5. Assembling Context Packs and Validating Index Health

When you are ready to construct a prompt for an LLM or want to verify the consistency of the database, use these advanced tools.

- **Tool:** `retrieve_context_pack`
  - **Parameters:**
    ```json
    {
      "project_path": "/absolute/path/to/your-project",
      "query": "how do we handle database connections and errors?",
      "max_chars": 12000,
      "include_neighbors": true,
      "rerank": true
    }
    ```
  - **Insight:** Packs relevant snippets, expands them with neighboring lines, re-ranks them using local LLM power, and structures them into a single token-budgeted prompt context block.

- **Tool:** `doctor_index`
  - **Parameters:**
    ```json
    {
      "project_path": "/absolute/path/to/your-project"
    }
    ```
  - **Insight:** Validates the search index, check-pointing consistency between SQLite database records, LanceDB vector storage, and FTS indexing, providing diagnostic suggestions if any anomalies are found.

