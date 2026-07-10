# 🛠️ Drupal Runtime Inspect (Spec 01)

MCP server for live Drupal 10/11 runtime discovery. Designed for **Zero-Configuration** and **Token-Efficiency**.

It executes PHP code directly via **Drush** (supporting Lando, DDEV, and Local environments) to bypass the need for any special API endpoints or authentication settings.

## ✨ Features

- **Drush-Powered**: No `DRUPAL_BASE_URL` or Auth headers required. Runs commands inside Lando/DDEV automatically.
- **Smart Noise Reduction**: Curates raw Drupal objects (like FieldDefinitions and EntityTypes) on the PHP side to strip circular references and service bloat.
- **Token Efficient**: Only returns the "Gold Standard" of properties needed by an AI agent.
- **Pagination & Filtering**: Supports `limit`, `offset`, and `query` parameters on `inspect_entity_types`, `inspect_modules`, `inspect_routes`, and `inspect_services`.
- **Schema-Aware**: Uses `@agent-forge/mcp-core` for standardized response envelopes.

## 🧰 Available Tools (12)

| Tool | Description |
|---|---|
| `inspect_entity_types` | List entity types. Returns entity_type_id, label, provider, class, handlers (storage class). Supports query filter and field projection. |
| `inspect_bundles` | List bundles for a specific entity type. Returns bundle (machine_name) and label. Requires `entity_type_id`. |
| `inspect_fields` | List field definitions for an entity type. Returns field_name, field_type, label, required, translatable, provider. Accepts optional `bundle`. |
| `inspect_modules` | List enabled modules. Returns machine_name, name, version. Supports query, limit, and offset. |
| `inspect_themes` | List installed themes. Returns machine_name, name, is_default (true for active frontend theme). |
| `inspect_routes` | Search Symfony routing table. Returns route_name, path, controller, requirements. |
| `inspect_services` | Search the DI container. Returns service id and resolved class. |
| `inspect_permissions` | List permission definitions. Returns permission (machine_name) and title. |
| `inspect_menus` | List all menu config entities. Returns id and label. |
| `inspect_vocabularies` | List taxonomy vocabularies. Returns vid and name. |
| `inspect_plugins` | List plugins for block, filter, condition, and queue_worker types. Returns plugin_type, plugin_id, label, class. |
| `search_runtime_objects` | Broad discovery across entity types and modules. Returns up to 5 matches each. |

## 🚀 Quick Start

### 1. Build inside the Forge (Monorepo)
```bash
# From the root of agent-forge
pnpm install
cd servers/drupal-runtime-inspect
npm run build
```

### 2. Configure MCP Client (e.g. Claude Desktop)
The server **automatically detects** your Drupal project root by looking upward from the current working directory. No path configuration is required in the server settings.

```json
{
  "mcpServers": {
    "drupal-runtime-inspect": {
      "command": "node",
      "args": [
        "/absolute/path/to/drupal-runtime-inspect/dist/index.js"
      ]
    }
  }
}
```

## 🧪 AI Agent Verification & Stress Test

If you are an AI agent tasked with verifying this server, follow this protocol strictly:

### 🎯 Objective
Validate the inventory discovery accuracy and token efficiency of the core runtime server.

### 🛠 Sequential Testing Protocol
One tool at a time. Do not skip steps.

1. **`inspect_entity_types`**: Run with default and then with field projection. Verify it correctly identifies core vs custom entities.
2. **`inspect_fields`**: Pick a complex node bundle (e.g. 'Article') and verify that it lists all base and config fields.
3. **`inspect_services`**: Search for a known service (e.g. 'router.no_access_checks') and verify its class mapping.
4. **`inspect_routes`**: Pick a path (e.g. /node/1) and verify the controller and permission metadata.

### 📝 Evaluation Criteria
For each tool:
- **Accuracy**: Does the data match the live Drupal state?
- **Projection**: Is the noise stripping aggressive enough for complex objects like `entity_types`?

**Provide a "Runtime Inventory Audit" before moving to the next server.**
```

## 🔋 Environment Variables

- `DRUPAL_ROOT_DIR`: (Optional) Absolute path to your Drupal project. If omitted, the server will try to auto-detect the root from the current working directory by looking for `composer.json` and a `web/` or `core/` folder.
- `DRUSH_OPTIONS_URI` / `DRUSH_URI`: (Optional) Passes `--uri=<value>` to Drush for multisite or specific environment targeting.

## 🛡️ Security

This server is designed for **local development**. It uses `drush php-script` to execute hardcoded, curated PHP snippets. Ensure you only use it in environments where you trust the local Drush access.
