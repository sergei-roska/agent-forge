# 👁 Web Observe & Capture (Spec 07)

MCP server for visual truth and DOM-level observation. It provides screenshot capabilities and lightweight DOM inspection to help agents verify frontend state.

## ✨ Features

- **Session-Aware Browser**: Maintain state (auth, cookies) across multiple tool calls via `session_id`.
- **Precise Screenshots**: Capture full page, specific viewports, or targeted regions/selectors.
- **Bounded DOM Inspection**: Retrieve HTML/Text excerpts with automatic truncation to save tokens.
- **Geometric Analysis**: Inspect bounding boxes, styles, and visibility for layout debugging.
- **Structural Snapshots**: Get a narrative summary of the page structure without raw HTML noise.

## 🧰 Available Tools (8)

| Tool | Purpose |
|---|---|
| `open_page_session` | Start a new browser session for a URL. |
| `capture_full_page_screenshot` | High-resolution capture of the entire page. |
| `capture_viewport_screenshot` | Capture only what is currently visible. |
| `capture_region_screenshot` | Capture specific coordinates or a selector. |
| `capture_page_snapshot` | Narrative summary of top DOM nodes. |
| `inspect_dom_excerpt` | Targeted HTML/Text retrieval (bounded). |
| `inspect_layout` | Audit bounding boxes and CSS styles. |
| `close_page_session` | Cleanup browser resources. |

## 🚀 Quick Start (Forge)

```bash
# From the root of agent-forge
pnpm install
cd servers/web-observe-capture
# Ensure browsers are installed
npx playwright install chromium
pnpm run build
```

## 🛠 MCP Client Configuration

To use this server in your MCP client (e.g., Claude Desktop), add the following to your configuration file:

```json
{
  "mcpServers": {
    "web-observe-capture": {
      "command": "node",
      "args": [
        "/absolute/path/to/web-observe-capture/dist/index.js"
      ]
    }
  }
}
```

*Note: Replace the path with the actual absolute path to your `dist/index.js`.*

## 🧪 AI Agent Verification & Stress Test

If you are an AI agent tasked with verifying this server, follow this protocol strictly:

### 🎯 Objective
Confirm browser stability, visual accuracy, and artifact management for frontend observation.

### 🛠 Sequential Testing Protocol
Execute step-by-step verification. Manage sessions carefully.

1. **`open_page_session`**: Verify session creation and viewport stability.
2. **`capture_full_page_screenshot`**: Verify the image is stored in the `artifacts/` folder and the response contains the correct path.
3. **`capture_region_screenshot`**: Test by both coordinates and CSS selector. Is the cropping accurate?
4. **`inspect_dom_excerpt`**: Test the truncation. Verify that `truncated=true` when content exceeds `max_chars`.
5. **`inspect_layout`**: Pick two overlapping or adjacent elements and verify their bounding boxes and styles.

### 📝 Evaluation Criteria
For each tool:
- **Stability**: Does the browser crash on heavy pages?
- **Artifact Management**: Are files cleaned up after `close_page_session` (if implemented/requested)?
- **Token Usage**: Is the `page_snapshot` tool descriptive enough without dumping raw HTML?

**Create a "Visual & DOM Audit Log" for each tool before closing the session.**
