# 🧠 Local Memory Search (Spec 08)

Local-first MCP server for project-scoped indexing, semantic retrieval, hybrid search, and compressed context packs.

It is designed as the resilient local memory/retrieval layer for agent workflows when remote vector infrastructure is unavailable or undesirable.

## ✨ Features

- **Strict Per-Project Isolation**: every index is scoped to one project root; no cross-project global index is built.
- **Hybrid Retrieval**: combines semantic similarity and keyword/BM25 search for higher recall and better fallback behavior.
- **Ollama-Backed Local Intelligence**: supports local embeddings, chunk enrichment, and query-time reranking.
- **Graceful Degradation**: falls back to local hash embeddings or keyword-only retrieval when Ollama or vector state is unavailable.
- **Agent-Ready Context Packs**: returns bounded excerpts grouped by file for direct reasoning/code-generation use.
- **Index Diagnostics**: exposes `health_check`, `index_status`, and `doctor_index` for verification and repair.

## 🧰 Available Tools (14)

| Tool | Purpose |
|---|---|
| `health_check` | Report server readiness, dependency health, and index path. |
| `index_status` | Show indexed file/chunk coverage and freshness estimate. |
| `index_project` | Scan a project and build chunk metadata for changed files, optionally in the background. |
| `embed_chunks` | Generate embeddings and sync the local LanceDB vector store, optionally in the background. |
| `list_runs` | List recent indexing and embedding runs for a project. |
| `get_run_status` | Inspect one background run by `run_id`. |
| `search_semantic` | Run vector similarity search over indexed chunks. |
| `search_keyword` | Run BM25 full-text keyword search over indexed chunks. |
| `search_hybrid` | Fuse semantic and keyword ranking with Reciprocal Rank Fusion. |
| `retrieve_context_pack` | Build a bounded, agent-ready context package for a query. |
| `explain_match` | Explain why a recorded search result matched. |
| `get_chunk` | Fetch a chunk by stable `chunk_id`. |
| `delete_project_index` | Remove all local index data for one project. |
| `doctor_index` | Diagnose index consistency and optionally repair known issues. |

## 🤖 Default Local Model Stack

- embeddings: `qwen3-embedding:8b`
- chunk metadata enrichment: `granite4:3b-h`
- query-time reranking and quality-sensitive synthesis: `qwen3.5:9b`

This is the v1 baseline profile. No separate low-memory profile is defined.

## 🚀 Quick Start (Forge)

```bash
# From the root of agent-forge
pnpm install
cd servers/local-memory-search
pnpm run build
```

### Environment Variables

- `LOCAL_VECTOR_SEARCH_DATA_ROOT`: override the local server data root.
- `LOCAL_VECTOR_SEARCH_DEFAULT_PROJECT`: default project path when `project_path` is omitted.
- `OLLAMA_BASE_URL`: override the Ollama base URL. Default: `http://127.0.0.1:11434`.

### Notes

- The state store uses `node:sqlite`, which is still marked experimental in Node 24.
- The vector store uses `@lancedb/lancedb`.
- The server never executes project code during indexing.

## 🛠 MCP Client Configuration

To use this server in your MCP client, point it at the built server entrypoint:

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

For the exported standalone package, use:

```json
{
  "mcpServers": {
    "local-memory-search": {
      "command": "node",
      "args": [
        "/absolute/path/to/agent-forge/standalone/local-memory-search/dist/index.js"
      ]
    }
  }
}
```

## 🧪 Manual MCP Testing Checklist

Use this sequence to verify the server end-to-end against a real project.

### 🎯 Objective

Confirm that the server can:

- initialize and report health;
- index one project without leaking outside its root;
- create embeddings locally;
- return useful hybrid results;
- produce a bounded context pack for agent consumption;
- diagnose index problems without crashing.

### 🛠 Sequential Testing Protocol

Test one tool at a time in this order:

1. **`health_check`**
   - Run with `verbose=true`.
   - Verify the response includes:
     - `status`
     - `indexPath`
     - `dbBackend`
     - `embeddingBackend`
   - If Ollama is down, verify the server reports degradation instead of failing.

2. **`index_status`**
   - Run before indexing.
   - Expect zero or near-zero counts for a fresh project.
   - Confirm the `project_path` namespace is correct.

3. **`index_project`**
   - Run with the target `project_path`.
   - For large repositories, prefer `background=true` and monitor with `get_run_status`.
   - Verify:
     - changed files are indexed;
     - skipped binary/large/minified files appear in warnings/skipped lists;
     - re-running without changes produces low or zero changed-file counts.

4. **`embed_chunks`**
   - Run after indexing.
   - Verify:
     - `embedded_new` is non-zero on the first pass;
     - `backend_used` is `ollama` when Ollama is available, otherwise fallback is explicit;
     - subsequent runs are incremental unless `fresh=true`.

5. **`search_keyword`**
   - Query for an exact term you know exists in the repo.
   - Verify the top results include the expected file paths.

6. **`search_semantic`**
   - Query with a conceptual phrase rather than an exact identifier.
   - Verify the results are still relevant, especially when embeddings are available.

7. **`search_hybrid`**
   - Query for a phrase containing both semantic intent and exact keywords.
   - Verify the response stays bounded and returns sensible ranking.
   - If semantic retrieval is unavailable, verify the warning explicitly says it degraded to keyword-only mode.

8. **`retrieve_context_pack`**
   - Run with a realistic query and `max_chars=12000`.
   - Verify:
     - excerpts are grouped across a limited number of files;
     - budget metadata is present;
     - truncation is explicit when the budget is exceeded.

9. **`explain_match`**
   - Use a `result_id` returned by one of the search tools.
   - Verify it returns lexical hits, semantic terms, and score breakdown instead of a generic explanation.

10. **`get_chunk`**
    - Fetch a known `chunk_id`.
    - Verify file path, line range, text, and metadata are all stable and coherent.

11. **`doctor_index`**
    - Run once with `auto_fix=false`.
    - Then run with `auto_fix=true` if you intentionally create stale vector/FTS state.
    - Verify it reports issues and repairs them without deleting the whole index unnecessarily.

12. **`delete_project_index`**
    - Run only at the end with `confirm=true`.
    - Verify all local state for that project is removed and `index_status` resets accordingly.

### 📝 Evaluation Criteria

For each tool, check:

- **Correctness**: does it return the expected files, chunks, or status?
- **Bounded Output**: does it stay compact and usable for an agent?
- **Fallback Quality**: does it degrade with warnings instead of hard failure?
- **Isolation**: does everything remain scoped to the requested `project_path`?
- **Repeatability**: are repeated calls stable when the corpus is unchanged?

### Suggested Test Query Set

Use a small set of repeatable queries against a known repository:

- exact identifier query
- conceptual architecture query
- mixed semantic + keyword query
- query that should produce zero matches

Example:

- `workflow aliases bashrc`
- `project indexing fallback behavior`
- `lancedb sqlite health check`
- `string-that-does-not-exist-anywhere`

## 📦 Standalone Export

To build the standalone MCP package:

```bash
cd /absolute/path/to/agent-forge
pnpm export:standalone -- local-memory-search
cd standalone/local-memory-search
npm install --legacy-peer-deps
npm run start
```

The standalone package is generated at:

- [standalone/local-memory-search](/home/sr/Projects/Workspace/agent-forge/standalone/local-memory-search)
