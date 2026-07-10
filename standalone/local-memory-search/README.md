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
  expansion and optional `qwen3.5:9b` LLM re-ranking.

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

## 🚀 Quick Start (Forge)

```bash
# From the root of agent-forge
pnpm install
pnpm --filter @agent-forge/server-local-memory-search build
pnpm --filter @agent-forge/server-local-memory-search test
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
        "LOCAL_VECTOR_SEARCH_DATA_ROOT": "/home/you/.agent-forge/local-memory-search"
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

Search-only configuration (when indexing is handled elsewhere):

```json
{
  "mcpServers": {
    "local-memory-search": {
      "command": "node",
      "args": [
        "/absolute/path/to/agent-forge/servers/local-memory-search/dist/index.js"
      ]
    }
  }
}
```

The frozen contract version is **1.0** (`server.manifest.json` →
`contract_frozen`). Tool names, required params, and the envelope shape must not
change without a version bump.

## 🧪 AI Agent Verification & Stress Test

If you are an AI agent tasked with verifying this server, follow this protocol
strictly:

### 🎯 Objective

Confirm hybrid retrieval quality, graceful degradation, and per-project isolation.

### 🛠 Sequential Testing Protocol

Execute in order after the indexer has completed at least one run:

```
health_check → index_status → search_keyword → search_semantic → search_hybrid
  → retrieve_context_pack → read_chunk_neighbors → explain_match → doctor_index
```

For each tool confirm:

- Summary-first bounded output
- Isolation to the requested `project_path`
- Deterministic ordering on repeat queries
- Degraded subsystems surface a `warnings[]` entry rather than a hard error

### 📝 Evaluation Criteria

- **Relevance**: Do top hits match the query intent?
- **Degradation**: With Ollama stopped, does `search_hybrid` still return
  keyword results with a warning?
- **Context packs**: Does `retrieve_context_pack` stay within the char budget?

**Produce a "Search Quality Audit" for each tool before finishing verification.**
