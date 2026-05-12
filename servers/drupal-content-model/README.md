# 📐 Drupal Content Model (Spec 02)

MCP server for structural editorial architecture. It explains how content is modeled, connected, and governed in Drupal 10/11.

## ✨ Features

- **Entity Relationship Graph**: Traverses `entity_reference` fields to build a mental map of the site structure.
- **Editorial Summary**: Zero-configuration tool to get a high-level narrative of the architecture (Node, Media, Taxonomy).
- **Life-cycle Visibility**: Inspect revisioning, translation, and moderation workflows.
- **Field Usage**: Analyze where fields are used across bundles without raw config noise.
- **Drush-Powered**: Zero-configuration, context-aware Project Root discovery.

## 🧰 Available Tools (10)

| Tool | Purpose |
|---|---|
| `inspect_content_types` | Summarize node bundles and editorial settings. |
| `inspect_media_types` | Summarize media bundles and source plugins. |
| `inspect_taxonomy_models` | Summarize vocabularies and term architecture. |
| `inspect_field_usage` | Explain how fields are used across bundles. |
| `inspect_reference_graph` | Show entity reference edges between bundles. |
| `inspect_display_modes` | Summarize view mode and form mode usage. |
| `inspect_revisioning` | Explain revisioning defaults and UI implications. |
| `inspect_translation` | Summarize translatability at entity/bundle levels. |
| `inspect_moderation` | Map bundles to content moderation workflows. |
| `summarize_editorial_model` | Narrative summary of the editorial architecture. |

## 🚀 Quick Start (Forge)

```bash
# From the root of agent-forge
npm install
cd servers/drupal-content-model
npm run build
```

### Configure MCP Client
Point your client to `dist/index.js`. It will **automatically detect** the Drupal project root from your workspace.

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

## 🧪 AI Agent Verification & Stress Test

If you are an AI agent tasked with verifying this server, follow this protocol strictly:

### 🎯 Objective
Validate the structural relationship mapping and editorial narrative depth of the content model server.

### 🛠 Sequential Testing Protocol
Verify each tool fully before proceeding.

1. **`summarize_editorial_model`**: Start here to get the "Big Picture". Evaluate if the narrative correctly describes the site's complexity.
2. **`inspect_reference_graph`**: Pick a bundle (e.g. node:article) and verify that it lists all outgoing `entity_reference` edges (to Media, Taxonomy, etc.).
3. **`inspect_field_usage`**: Pick a common field and verify it identifies all bundles where that field is attached.
4. **`inspect_moderation`**: Verify it correctly identifies the active Workflow (if any) for a given set of bundles.

### 📝 Evaluation Criteria
For each tool:
- **Narrative Value**: Does the output help you "understand" the architecture or just "read" it?
- **Graph Coverage**: Are there missing connections or is the graph complete?

**Produce an "Editorial Architecture Review" for each tool before moving to the next.**
```
