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

## 🚀 Installation & Configuration

### Via npm (Recommended)

1. Install the server globally:
   ```bash
   npm install -g @drupal-forge/server-content-model
   ```

2. Add the following to your MCP client configuration (e.g., `claude_desktop_config.json` or Cursor settings):
   ```json
   {
     "mcpServers": {
       "drupal-content-model": {
         "command": "npx",
         "args": [
           "-y",
           "@drupal-forge/server-content-model"
         ]
       }
     }
   }
   ```

**Optional environment variables** (for multisite or non-default URI):
- `DRUSH_OPTIONS_URI` or `DRUSH_URI` — passed as `--uri=` to every Drush invocation.

## 🧭 Exploration & Demonstration Journey

Follow this step-by-step scenario to explore the Drupal content architecture and discover how various content entities, media assets, and relationships are structured and governed.

### Step 1: Getting the Bird's-Eye View
Start by obtaining a high-level summary of the editorial model. This sets the stage and helps you understand the general scale and complexity of the Drupal site's content ecosystem.
*   **Tool**: `summarize_editorial_model`
*   **Arguments**: `{ entity_type_id: "node" }`
*   **Value**: You'll discover the primary entity domain, the total number of content bundles (content types), how many reference relationships connect them, and the top-referenced content types.

### Step 2: Surveying the Content & Media Archetypes
Now that you have the big picture, explore the specific building blocks available to content creators: nodes, media, and taxonomy structures.
*   **Tools**:
    *   `inspect_content_types` (no arguments): Lists all content types (e.g., Articles, Pages), whether they support revisions, and which publishing workflows govern them.
    *   `inspect_media_types` (no arguments): Reveals the media bundles configured (e.g., Image, Document, Video), their underlying source plugins, and whether they are translatable.
    *   `inspect_taxonomy_models` (no arguments): Details the vocabulary schemas used for classification and tagging.
*   **Value**: This maps the structural diversity of the site, showing how content, rich media assets, and categorization vocabularies are classified.

### Step 3: Deep Diving into Field Layouts & Reuse
Zoom in on a specific content type (like `article`) to understand its fields and see how fields are shared across the system.
*   **Tools**:
    *   `inspect_field_usage` `{ entity_type_id: "node", bundle: "article" }`: Inspect the specific fields mapped to the Article bundle, including their machine names and field types.
    *   `inspect_field_usage` `{ entity_type_id: "node" }`: Execute this without a bundle to see a global catalog of fields, revealing which fields are reused across multiple bundles.
*   **Value**: You'll see the exact schema of a bundle and identify shared fields, helping you evaluate field reuse efficiency and consistency.

### Step 4: Mapping the Entity Relationship Graph
Content in Drupal is rarely isolated. Trace how different content entities, media assets, and taxonomies link together.
*   **Tool**: `inspect_reference_graph` `{ entity_type_id: "node" }`
*   **Value**: This outputs the connections between content bundles, mapping the outgoing reference fields (e.g., an article pointing to an author or an image media entity). You will see exactly how information flows between entity types.

### Step 5: Uncovering Content Presentation Layouts
How are these content types presented to end-users and content editors? Drupal manages this via Display Modes (View Modes and Form Modes).
*   **Tool**: `inspect_display_modes` `{ entity_type_id: "node" }`
*   **Value**: You'll discover all configured form entry modes (e.g., default, registration) and view modes (e.g., teaser, full, search_result) that control how this content type is rendered in different contexts.

### Step 6: Auditing Governance, Translations, and Publishing Workflows
Finally, examine the editorial governance: how content history is tracked (revisioning), how global audiences are served (translation), and how content transitions from draft to published (moderation).
*   **Tools**:
    *   `inspect_revisioning` `{ entity_type_id: "node" }`: Checks whether node revisions are tracked, helping you understand revision history capabilities.
    *   `inspect_translation` `{ entity_type_id: "node" }`: Discovers multilingual configurations and identifies if translation is enabled.
    *   `inspect_moderation` `{ entity_type_id: "node", bundle: "article" }`: Lists active moderation workflows, all available states (e.g., Draft, In Review, Published), and valid state transitions.
*   **Value**: You'll gain a complete understanding of the content's life-cycle policies, tracking mechanisms, localization readiness, and editorial team workflows.


