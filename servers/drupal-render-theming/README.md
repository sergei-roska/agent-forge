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

## 🎬 Guided Exploration & Demonstration Scenario

Follow this exploratory developer journey to experience how the MCP server demystifies Drupal's rendering and theming systems, layer by layer, using all available tools.

### Phase 1: Understanding Theme Architecture and Layouts

Start by exploring the active theme, its regions, and how content blocks are arranged.

1. **Discover Active Theme Settings**
   Call `inspect_theme_state` to query the current theme setup.
   - *What you discover:* The active theme, the admin theme, the base theme inheritance chain, and the list of layout regions.

2. **Map Block Placements**
   Call `inspect_blocks_and_regions` to list active blocks and see where they reside.
   - *What you discover:* A clean list of blocks showing their IDs, labels, weight, status, and target region. Try filtering by a specific region (e.g., `sidebar_first`) to see how content is structured.

3. **Explore Single Directory Components (SDC)**
   Call `inspect_sdc_components` (without arguments) to list the modern components available.
   - *What you discover:* A list of SDC components, their extensions, file paths, and whether they define a JSON schema (`has_schema`).
   - *Go deeper:* Choose a specific `component_id` (e.g., `my_theme:hero`) and call the tool again with the ID to retrieve its full definition, including properties, slots, and metadata.

---

### Phase 2: Introspecting the Render Pipeline

Investigate how Drupal builds render output and attaches front-end assets.

4. **Get a High-Level Render Summary**
   Call `summarize_render_path` for a specific theme hook (e.g., `node` or `block`).
   - *What you discover:* A fast, consolidated summary mapping the theme hook to its template path, preprocess function count, and attached libraries.

5. **Analyze the Cleaned Render Array**
   Call `inspect_render_array` with a target render element or block. Experiment with `max_depth=2` and then `max_depth=5`.
   - *What you discover:* A noise-filtered view of the render structure. Notice how `#cache` and `#attached` arrays are automatically projected out, allowing you to focus on raw component data and properties.

6. **Examine Asset Attachments**
   Call `inspect_library_attachments` for the same render element.
   - *What you discover:* The specific CSS/JS libraries attached to the page and any variables injected via `drupalSettings` to power interactive elements.

---

### Phase 3: Tracing and Customizing the Template Pipeline

Track how variables flow and how templates are selected for customization.

7. **Find Template Overriding Opportunities**
   Call `inspect_template_suggestions` for a given hook (e.g., `node__article`).
   - *What you discover:* The exact list of template candidate names, ordered from lowest to highest priority (where the last item overrides the others).

8. **Locate the Selected Template**
   Call `trace_template_resolution` to find which template Drupal actually loads for the hook.
   - *What you discover:* The filename, its absolute path in the codebase, the theme registry properties, and the preprocess chain.

9. **Debug the Preprocess Function Chain**
   Call `find_preprocess_chain` for the hook.
   - *What you discover:* The exact sequence of hook and preprocess functions executed to prepare variables, showing the chronological pipeline that shapes the final output.
