# 🧠 Local Memory Search (Spec 08.2)

The **read-only consumer** half of the local agent-memory system. It exposes the
agent's primary retrieval interface — hybrid search, context packs, chunk
navigation, and health diagnostics — over the LanceDB index produced by the
companion **`local-memory-indexer`** (Spec 08.1).

It runs in **strict read-only mode**: it never writes to LanceDB, never mutates
the SQLite state DB, and never writes to the filesystem. This guarantees agent
search latency is never impacted by background indexing writes.

## ✨ Design Highlights

- **Strict read-only enforcement** — LanceDB tables are wrapped in a Proxy that
  throws `READONLY_VIOLATION` on any mutating call; SQLite is opened
  `readonly` + `PRAGMA query_only = ON` (Spec §2.2).
- **Hybrid retrieval** — parallel vector ANN + BM25/FTS fused with Reciprocal
  Rank Fusion, an exact-identifier boost, recency boost, and relevance-gap
  filtering (Spec §2.3).
- **Graceful degradation, never an error** — every tool returns a usable result
  set with a `warnings[]` array. The cascade is: lock → brute-force ANN → FTS →
  SQLite `LIKE`; embedding down → keyword-only (`alpha=0`); LanceDB missing →
  SQLite fallback (Spec §2.4 / §5).
- **Per-project isolation** — every query is filtered by `project_path` **and**
  `schema_version`; no cross-project federation.
- **Agent-ready context packs** — token-budgeted excerpts with optional neighbor
  expansion and optional `qwen3.5:9b` LLM re-ranking.

## 🧰 Tool Catalog (11, read-only)

| Tool | Purpose |
|---|---|
| `search_hybrid` | Primary hybrid (vector + BM25/RRF) search. |
| `search_semantic` | Pure vector ANN search. |
| `search_keyword` | Pure BM25/FTS search. |
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

## 🤖 Default Local Model Stack

- embeddings: `qwen3-embedding:8b` (must match the model the indexer used), with
  a `Transformers.js` CPU fallback.
- query-time re-ranking: `qwen3.5:9b`.

## 🚀 Build & Test

```bash
# From the root of agent-forge
pnpm install
pnpm --filter @agent-forge/server-local-memory-search build
pnpm --filter @agent-forge/server-local-memory-search test
```

### Environment Variables

- `LOCAL_VECTOR_SEARCH_DATA_ROOT` — shared data root (must match the indexer).
- `LOCAL_VECTOR_SEARCH_DEFAULT_PROJECT` — default `project_path` when omitted.
- `OLLAMA_BASE_URL` — Ollama base URL. Default: `http://127.0.0.1:11434`.
- `EMBED_MODEL` / `RERANK_MODEL` — model overrides.

## 🛠 MCP Client Configuration

```json
{
  "mcpServers": {
    "local-memory-search": {
      "command": "node",
      "args": ["/absolute/path/to/agent-forge/servers/local-memory-search/dist/index.js"]
    }
  }
}
```

## 🧪 Manual Verification

```
health_check  → index_status → search_keyword → search_semantic → search_hybrid
              → retrieve_context_pack → read_chunk_neighbors → explain_match → doctor_index
```

For each tool confirm: summary-first bounded output, isolation to `project_path`,
deterministic ordering on repeat, and that degraded subsystems surface a
`warnings[]` entry rather than an error.

The frozen contract version is **1.0** (`server.manifest.json` →
`contract_frozen`). Tool names, required params, and the envelope shape must not
change without a version bump.
