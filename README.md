# Agent Forge 🛠️

Agent Forge is a pnpm monorepo for building, testing, and shipping Model Context Protocol (MCP) servers and specialized agent tools. The workspace is centered on Drupal ecosystem intelligence, local codebase memory, and browser-based observation.

## Workspace Layout

### `packages/`
Shared libraries and infrastructure used across the workspace:
- `mcp-core` - shared MCP contracts, envelope helpers, and base types.
- `browser-observer` - browser observation utilities.
- `drupal-api-client` - Drupal API client helpers.
- `filesystem-index` - local filesystem indexing helpers.

### `servers/`
Deployable MCP servers:
- `drupal-codebase-introspect` - static Drupal codebase introspection and symbol mapping.
- `drupal-config-intelligence` - Drupal config lifecycle, drift, and deployment safety analysis.
- `drupal-content-model` - editorial structure, relationships, and moderation inspection.
- `drupal-operations-debug` - runtime diagnostics, logs, queues, cron, and health state.
- `drupal-render-theming` - template resolution, preprocess chains, SDCs, and layout inspection.
- `drupal-runtime-inspect` - runtime Drupal entity, field, module, theme, and permission inspection.
- `local-memory-indexer` - write-only local indexing and embedding pipeline.
- `local-memory-search` - read-only local retrieval, context packs, and diagnostics.
- `web-observe-capture` - browser screenshots and DOM/layout observation.

## 🚀 Installation & Configuration

### For AI Agents (Automated Setup)
If you are an AI Coding Agent, you can automatically install and configure all 9 MCP servers for the user:

1. **Install Globally**: Run the following command to install all 9 servers globally on the user's machine:
   ```bash
   npm install -g @drupal-forge/server-codebase-introspect @drupal-forge/server-config-intelligence @drupal-forge/server-content-model @drupal-forge/server-operations-debug @drupal-forge/server-render-theming @drupal-forge/server-runtime-inspect @local-memory/indexer @local-memory/search @drupal-forge/server-web-observe-capture
   ```

2. **Configure Client**: Read the unified JSON configuration in the next section and merge/append it into the user's MCP client configuration file (e.g. `~/.config/Claude/claude_desktop_config.json` on Linux/macOS, or `%APPDATA%/Claude/claude_desktop_config.json` on Windows).

---

### Unified MCP Configuration (via npm/npx)

Add the following block to your MCP client configuration (e.g. `claude_desktop_config.json` or Cursor settings) to enable all 9 servers immediately without downloading the source code:

```json
{
  "mcpServers": {
    "drupal-codebase-introspect": {
      "command": "npx",
      "args": ["-y", "@drupal-forge/server-codebase-introspect"]
    },
    "drupal-config-intelligence": {
      "command": "npx",
      "args": ["-y", "@drupal-forge/server-config-intelligence"]
    },
    "drupal-content-model": {
      "command": "npx",
      "args": ["-y", "@drupal-forge/server-content-model"]
    },
    "drupal-operations-debug": {
      "command": "npx",
      "args": ["-y", "@drupal-forge/server-operations-debug"]
    },
    "drupal-render-theming": {
      "command": "npx",
      "args": ["-y", "@drupal-forge/server-render-theming"]
    },
    "drupal-runtime-inspect": {
      "command": "npx",
      "args": ["-y", "@drupal-forge/server-runtime-inspect"]
    },
    "web-observe-capture": {
      "command": "npx",
      "args": ["-y", "@drupal-forge/server-web-observe-capture"]
    }
  }
}
```

*Note: For the local memory servers, ensure Ollama is running and the required models are pulled. By default, the servers use `qwen3-embedding:4b` for vector embeddings (run `ollama pull qwen3-embedding:4b`) and `granite4.1:3b` for pre-embedding chunk enrichment and query-time re-ranking (run `ollama pull granite4.1:3b`). Adjust the path in `LOCAL_VECTOR_SEARCH_DATA_ROOT` to a suitable folder on your machine.*

## License

Apache License 2.0.
