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

### 3. Environment Variables

- `DRUPAL_ROOT_DIR`: (Optional) Absolute path to your Drupal project. If omitted, the server will try to auto-detect the root from the current working directory by looking for `composer.json` and a `web/` or `core/` folder.
- `DRUSH_OPTIONS_URI` / `DRUSH_URI`: (Optional) Passes `--uri=<value>` to Drush for multisite or specific environment targeting.

## 🛡️ Security

This server is designed for **local development**. It uses `drush php-script` to execute hardcoded, curated PHP snippets. Ensure you only use it in environments where you trust the local Drush access.

## 🧭 Interactive Developer Journey & Feature Demo

Explore this step-by-step scenario to discover how a developer can map, query, and audit a live Drupal application's runtime state using MCP tools. This walkthrough demonstrates the zero-configuration setup, token-efficient responses, and smart object projection capabilities of the server.

### Phase 1: High-Level Environment Discovery

Start by getting a bird's-eye view of your Drupal application's general environment and configuration.

1. **`search_runtime_objects`**: Begin with a broad search query (e.g., `query: "node"`) to discover which entities or modules match this term. This acts as a starting point to see what's active in your database and codebase.
2. **`inspect_modules`**: Retrieve the list of all enabled modules on the site. You can use pagination (`limit` and `offset`) or a `query` filter to find specific modules (e.g., `query: "views"`).
3. **`inspect_themes`**: List the installed themes to identify which theme is active as the default frontend interface and which is used for administration.

### Phase 2: Mapping the Content Model (Data Structure)

Dive deep into how the site's data is structured and stored at runtime.

4. **`inspect_entity_types`**: List the available entity types to understand the core database storage and custom definitions. Notice the smart projection that strips out circular references and heavy service metadata, keeping the output clean and token-efficient.
5. **`inspect_bundles`**: Select a main content entity type (such as `node`) and inspect its configured bundles (like `article` or `page`) to understand the content types defined on the site.
6. **`inspect_fields`**: Pick a bundle (e.g., `article`) and retrieve its field definitions to see field types, labels, required state, and translatability properties.

### Phase 3: Inspecting Navigation and Taxonomy

Understand how content is classified and structured for site visitors.

7. **`inspect_vocabularies`**: List taxonomy vocabularies (e.g., tags, categories) to see how taxonomy is organized across the site.
8. **`inspect_menus`**: List all menu configuration entities to map out the site's navigation structures and main menus.

### Phase 4: Under the Hood - Dependency Injection & Extensibility

Inspect Drupal's service container and plugin systems directly from your client.

9. **`inspect_services`**: Query the Dependency Injection (DI) container for a specific service ID (e.g., `query: "router.no_access_checks"`) to retrieve its fully qualified class mapping.
10. **`inspect_plugins`**: Search for registered plugins of a specific type (e.g., `plugin_type: "block"` or `plugin_type: "filter"`) to see active plugins, their classes, and labels.

### Phase 5: Routing and Security Policies

Trace how requests are mapped to controllers and how access is controlled.

11. **`inspect_routes`**: Search the Symfony routing table for paths (e.g., `query: "/node/"`) to locate corresponding controllers and their routing parameters.
12. **`inspect_permissions`**: List all defined system permissions (e.g., machine names and human-readable titles) to explore the access control options available to configure user roles.
