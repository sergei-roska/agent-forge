# Agent Forge 🛠️

Agent Forge is a high-performance monorepo workspace dedicated to building, testing, and shipping **Model Context Protocol (MCP)** servers and specialized agentic tools. It provides a structured environment for developing intelligent interfaces, with a particular focus on Drupal ecosystem intelligence and browser-based observation.

## 📁 Project Structure

This workspace is organized as a `pnpm` monorepo:

- **`packages/`**: Core shared libraries and infrastructure.
  - `mcp-core`: Strict contracts and base types for MCP servers (powered by Zod).
  - `browser-observer`: Tools for tracking and analyzing browser interactions.
  - `drupal-api-client`: Unified client for interacting with Drupal APIs.
  - `filesystem-index`: Fast indexing for local codebase analysis.
- **`servers/`**: Specialized MCP servers ready for deployment.
  - `drupal-*`: A suite of servers for Drupal codebase introspection, config intelligence, and content modeling.
  - `local-memory-search`: Semantic search and memory capabilities for agents.
  - `web-observe-capture`: Real-time browser capture and observation.
- **`standalone/`**: Self-contained, exported versions of tools for independent use.
- **`specs/`**: Documentation and protocol specifications.

## 🚀 Getting Started

### Prerequisites

- **Node.js**: `v20.0.0` or higher
- **pnpm**: `v8.0.0` or higher

### Installation

Clone the repository and install dependencies from the root:

```bash
pnpm install
```

### Building the Project

Compile all packages and servers in the workspace:

```bash
pnpm run build
```

## 🛠️ Development

Available scripts from the root:

- `pnpm run build`: Build all workspace members.
- `pnpm run test`: Run tests across all packages.
- `pnpm run typecheck`: Run TypeScript validation.
- `pnpm run export:standalone`: Export servers to standalone bundles in the `standalone/` directory.
- `pnpm run verify:standalone`: Validate the integrity of standalone exports.

## 🧩 MCP Integration

Each server in the `servers/` directory can be integrated with MCP-compatible clients (like Claude Desktop or custom agents). 

1. Navigate to a specific server: `cd servers/some-server`.
2. Follow the server-specific instructions in its `README.md`.
3. Point your client to the server's entry point (usually `dist/index.js` after building).

## 🛡️ License

Private workspace. All rights reserved.
