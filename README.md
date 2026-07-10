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

### `standalone/`
Exported standalone bundles for selected tools.

### `specs/`
Protocol and implementation specifications for the workspace.

## Requirements

- Node.js `>=20.0.0`
- pnpm `>=8.0.0`

## Common Commands

Run from the repository root:

```bash
pnpm install
pnpm run build
pnpm run test
pnpm run typecheck
```

Additional workspace commands:

```bash
pnpm run export:standalone
pnpm run export:standalone:all
pnpm run verify:standalone
```

## Working With Servers

Each server has its own `README.md` and `package.json` under `servers/<name>/`.

Typical flow:
1. Enter the server directory.
2. Read the server-specific README for setup and runtime notes.
3. Build the server and point your MCP client to the generated `dist/index.js` entry point.

Example:

```bash
cd servers/drupal-runtime-inspect
pnpm run build
```

## MCP Integration

Most servers expose an MCP-compatible entry point after build. Configure your client using the server directory name and its `dist/index.js` file, for example:

```json
{
  "mcpServers": {
    "drupal-runtime-inspect": {
      "command": "node",
      "args": ["/absolute/path/to/agent-forge/servers/drupal-runtime-inspect/dist/index.js"]
    }
  }
}
```

## License

Apache License 2.0.
