# 🎨 Drupal Render & Theming (Spec 06)

MCP server for explaining Drupal's complex template resolution, preprocess chains, and SDC component architecture without metadata noise.

## ✨ Features

- **Noise-Filtered Render Arrays**: Inspect component data with automatic projection and depth control.
- **Template Traceability**: Identify suggestions and actual chosen templates with file paths.
- **Preprocess Mapping**: Trace variables back to their preprocess functions and theme registry source.
- **Modern SDC Support**: Introspect Single Directory Components (Prop schemas, Paths).
- **Layout Logic**: Map regions and blocks for the active theme.
- **Library Tracking**: Identify attached CSS/JS library dependencies.

## 🧰 Available Tools (9)

| Tool | Purpose |
|---|---|
| `inspect_theme_state` | Summarize active/base themes and regions. |
| `inspect_template_suggestions` | List possible template files for a hook. |
| `trace_template_resolution` | Reveal the winning template and its source file. |
| `find_preprocess_chain` | List all preprocess functions for a render target. |
| `inspect_render_array` | Bounded view of component data/structure. |
| `inspect_library_attachments` | Map CSS/JS library dependencies. |
| `inspect_blocks_and_regions` | Summarize layout placement. |
| `inspect_sdc_components` | Metadata for Single Directory Components. |
| `summarize_render_path` | End-to-end "story" from data to theme hook to template. |

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
2. **`inspect_render_array`**: Test with `max_depth=2` and then `max_depth=5`. Verify that `#cache` and `#attached` are properly stripped to save tokens.
3. **`find_preprocess_chain`**: Verify it lists functions in the actual execution order.
4. **`inspect_sdc_components`**: Test if it discovers components and correctly identifies the presence of prop schemas.

### 📝 Evaluation Criteria
For each tool:
- **Token Efficiency**: This is the most critical server for token saving. Check if the output projection is aggressive enough.
- **Ease of Use**: Does the "Render Path" narrative help you understand the theming logic without further digging?

**Submit a "Theming Verification Report" focusing on projection quality.**
