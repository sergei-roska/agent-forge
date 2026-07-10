# 📐 Drupal Content Model (Spec 02)

MCP server for structural editorial architecture. It explains how content is modeled, connected, and governed in Drupal 10/11.

## ✨ Features

- **Entity Relationship Graph**: Traverses `entity_reference`, `entity_reference_revisions`, `image`, and `file` fields to map the full content relationship graph.
- **Editorial Summary**: Composite snapshot of bundle counts, reference edges, and moderation state for an entity domain.
- **Life-cycle Visibility**: Inspect revisioning, translation, and moderation workflows.
- **Field Usage**: Analyze where fields are used across bundles — either per-bundle or aggregated across all bundles.
- **Drush-Powered**: Executes PHP inside the active Drupal environment via `drush php-script`. Auto-detects Lando, DDEV, or local Drush.

## 🧰 Available Tools (10)

| Tool | Required params | Returns | Module deps |
|---|---|---|---|
| `inspect_content_types` | — | `bundle`, `label`, `revisionable`, `workflow` | `content_moderation` (optional) |
| `inspect_media_types` | — | `bundle`, `label`, `source_plugin`, `translatable` | `media`; `content_translation` (optional) |
| `inspect_taxonomy_models` | — | `vocabulary`, `label` | `taxonomy` |
| `inspect_field_usage` | `entity_type_id` | `name`, `type`, `label`, `bundle` / `bundles[]` | — |
| `inspect_reference_graph` | `entity_type_id` | `bundle`, `field`, `type`, `target_type`, `target_bundles` | — |
| `inspect_display_modes` | `entity_type_id` | `view_modes[]`, `form_modes[]` | — |
| `inspect_revisioning` | `entity_type_id` | `revisionable`, `revision_ui` | — |
| `inspect_translation` | `entity_type_id` | `translatable` | `content_translation` |
| `inspect_moderation` | `entity_type_id` + `bundle` (recommended) | `moderated`, `workflow`, `states[]` | `content_moderation` |
| `summarize_editorial_model` | `entity_type_id` | `domain`, `bundle`, `bundles_count`, `reference_edges`, `moderation`, `top_references[]` | `content_moderation` (optional) |

> **Note on `inspect_revisioning`**: Revisioning is an entity-type-level setting in Drupal — the `bundle` parameter is not accepted by this tool. Always call it with `entity_type_id` only (e.g. `node`, `block_content`).

> **Note on `inspect_moderation`**: Although `bundle` is technically optional in the schema, calling without it **always returns `moderated: false`**, because Drupal workflow assignment is per-bundle. Always provide both `entity_type_id` and `bundle` for meaningful results.

> **Note on `inspect_taxonomy_models`**: Use the `vocabulary` parameter (not `bundle`) to filter by a specific vocabulary machine_name.

## 🚀 Quick Start (Forge)

```bash
# From the root of agent-forge
npm install
cd servers/drupal-content-model
npm run build
```

### Configure MCP Client

Point your client to `dist/index.js`. The server discovers the Drupal project root automatically by walking up from `process.cwd()`, looking for `web/core`, `docroot/core`, or `core/index.php`.

```json
{
  "mcpServers": {
    "drupal-content-model": {
      "command": "node",
      "args": [
        "/absolute/path/to/drupal-content-model/dist/index.js"
      ]
    }
  }
}
```

**Optional environment variables** (for multisite or non-default URI):
- `DRUSH_OPTIONS_URI` or `DRUSH_URI` — passed as `--uri=` to every Drush invocation.

## 🧪 AI Agent Verification & Stress Test

If you are an AI agent tasked with verifying this server, follow this protocol strictly:

### 🎯 Objective
Validate the structural relationship mapping and editorial narrative depth of the content model server.

### 🛠 Sequential Testing Protocol
Verify each tool fully before proceeding.

1. **`summarize_editorial_model`** `{ entity_type_id: "node" }` — Start here to get the "Big Picture". Verify that `bundles_count` matches the count from `inspect_content_types`, and `reference_edges` is non-zero if the site has any `entity_reference` fields.
2. **`inspect_reference_graph`** `{ entity_type_id: "node", bundle: "article" }` — Verify that it lists all outgoing reference edges (to Media, Taxonomy, etc.) and that `target_bundles` is either an array or `"all"`.
3. **`inspect_field_usage`** `{ entity_type_id: "node", bundle: "article" }` — Verify the list of fields on the bundle. Then call without `bundle` to confirm the aggregated result includes a `bundles[]` array per field.
4. **`inspect_moderation`** `{ entity_type_id: "node", bundle: "article" }` — Verify it correctly identifies the active Workflow (if any) and lists all states.

### 📝 Evaluation Criteria
For each tool:
- **Narrative Value**: Does the output help you "understand" the architecture or just "read" it?
- **Graph Coverage**: Are there missing connections or is the graph complete?

**Produce an "Editorial Architecture Review" for each tool before moving to the next.**

