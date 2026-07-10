# 🎨 Drupal Render & Theming (Spec 06)

MCP server for explaining Drupal's complex template resolution, preprocess chains, and SDC component architecture without metadata noise.

## ✨ Features

- **Noise-Filtered Render Arrays**: Inspect component data with automatic projection and depth control (`#cache` and `#attached` are stripped from previews).
- **Template Traceability**: Identify suggestions and actual chosen templates with file paths.
- **Preprocess Mapping**: Trace variables back to their preprocess functions and theme registry source.
- **Modern SDC Support**: Introspect Single Directory Components (list with `has_schema` flag, or fetch raw plugin definition).
- **Layout Logic**: Map regions and blocks for the default theme.
- **Library Tracking**: Identify attached CSS/JS library names and `drupalSettings` keys.

## 🧰 Available Tools (9)

| Tool | Purpose |
|---|---|
| `inspect_theme_state` | Get active theme, admin theme, base theme chain, region list and count. |
| `inspect_template_suggestions` | List candidate templates for a hook in priority order (last element wins). Supports node, block, and field hooks. |
| `trace_template_resolution` | Get template name, path, type, and preprocess functions from the theme registry for a hook. Returns the same registry data as `find_preprocess_chain`. |
| `find_preprocess_chain` | List all preprocess functions for a hook plus template name/path from the theme registry. Use to debug variable availability or alter order. |
| `inspect_render_array` | Build a depth-limited render array preview with `#cache` and `#attached` stripped. Returns summary (#theme / #type, top-level keys). |
| `inspect_library_attachments` | List `#attached` library names and top-level `drupalSettings` keys for a node or block render. |
| `inspect_blocks_and_regions` | List blocks in the default theme: id, label, region, plugin_id, weight, status. Optionally filter by region. |
| `inspect_sdc_components` | Without `component_id`: summary list (id, extension, path, has_schema). With `component_id`: raw plugin definition object. Requires SDC module. |
| `summarize_render_path` | End-to-end summary: theme_hook → template name/path, preprocess count, library count. Fast overview before deeper inspection. |

### Shared Optional Parameter

All tools accept an optional **`project_root`** parameter — an absolute path to the Drupal project root. If omitted, the server falls back to the `DRUPAL_ROOT_DIR` or `DRUPAL_ROOT` environment variables, then auto-detects the root by walking up from `cwd`.

## 🚀 Quick Start (Forge)

```bash
# From the root of agent-forge
pnpm install
cd servers/drupal-render-theming
pnpm run build
```

## 🛠 MCP Client Configuration

To use this server in your MCP client (e.g., Claude Desktop), add the following to your configuration file:

```json
{
  "mcpServers": {
    "drupal-render-theming": {
      "command": "node",
      "args": [
        "/absolute/path/to/drupal-render-theming/dist/index.js"
      ]
    }
  }
}
```

*Note: Replace the path with the actual absolute path to your `dist/index.js`.*

## 🧪 AI Agent Verification & Stress Test

If you are an AI agent tasked with verifying this server, follow this protocol strictly:

### 🎯 Objective
Validate the high-signal "frontend lens" capabilities and noise-reduction logic of the render introspection server.

### 🛠 Sequential Testing Protocol
Thoroughly verify one tool before switching context.

1. **`summarize_render_path`**: Start here. Pick a block or node and verify the "End-to-End Story". Does it connect to the template correctly?
2. **`inspect_render_array`**: Test with `max_depth=2` and then `max_depth=5`. Verify that `#cache` and `#attached` are absent from the `render_array_preview` — this stripping is intentional and expected.
3. **`find_preprocess_chain`**: Verify it lists functions in the actual execution order.
4. **`inspect_sdc_components`**: Test without `component_id` to confirm the summary list includes `has_schema` boolean. Then test with a specific `component_id` to verify the raw plugin definition is returned.

### 📝 Evaluation Criteria
For each tool:
- **Token Efficiency**: This is the most critical server for token saving. Check if the output projection is aggressive enough.
- **Ease of Use**: Does the "Render Path" narrative help you understand the theming logic without further digging?

**Submit a "Theming Verification Report" focusing on projection quality.**
