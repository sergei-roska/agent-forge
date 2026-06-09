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

## 🧰 Available Tools (11, read-only)

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

> `delete_project_index` is **intentionally not exposed** — delete operations
> belong exclusively to the indexer process.

### Common search parameters

Most search tools accept:

| Parameter | Type | Default | Description |
|---|---|---|---|
| `project_path` | string | env default | Absolute path to the indexed project root. |
| `query` | string | *(required)* | Natural-language or keyword query. |
| `limit` | integer | `10` | Max results to return. |
| `offset` | integer | `0` | Pagination offset. |
| `max_chars` | integer | `2000` | Truncate chunk text in results. |
| `summary_only` | boolean | `false` | Return compact summaries instead of full text. |
| `filters` | object | — | Filter by `file_path`, `language`, `chunk_kind`, etc. |

`search_hybrid` additionally accepts `alpha` (vector vs keyword weight, default
`0.5`), `rrf_k`, `recency_weight`, and `gap_threshold`.

### Context & diagnostics highlights

- **`retrieve_context_pack`** — `max_files`, `max_chars`, `include_neighbors`,
  `neighbor_hops`, `rerank`, `truncate_strategy`.
- **`read_chunk_neighbors`** — `chunk_id`, `before`, `after` (chunk counts).
- **`search_similar`** — `file_path` + optional `symbol` or `start_line`.
- **`health_check`** — optional `verbose` for chunk counts and schema versions.

## 🤖 Default Local Model Stack

- embeddings: `qwen3-embedding:8b` (must match the model the indexer used), with
  a `Transformers.js` CPU fallback.
- query-time re-ranking: `qwen3.5:9b`.

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
| `EMBED_MODEL` | `qwen3-embedding:8b` | Query embedding model (must match indexer). |
| `RERANK_MODEL` | `qwen3.5:9b` | LLM re-ranker for `retrieve_context_pack`. |

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
