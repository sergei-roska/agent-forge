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

### Tool Schema Details

#### 1. `open_page_session`
Starts a browser session for a given URL and returns a `session_id` used by all subsequent tools.
* **Parameters**:
  * `url` (string, required): Absolute HTTP(S) URL.
  * `wait_until` (string, optional, default `"networkidle"`): Playwright wait state: `"load"` | `"domcontentloaded"` | `"networkidle"` | `"commit"`.
  * `width` (number, optional, default `1280`): Viewport width in px.
  * `height` (number, optional, default `720`): Viewport height in px.
* **Returns**:
  ```json
  {
    "session_id": "uuid-string-here",
    "url": "https://example.com",
    "title": "Example Page",
    "viewport": { "width": 1280, "height": 720 }
  }
  ```

#### 2. `capture_full_page_screenshot`
Screenshots the entire scrollable page, including content below the fold.
* **Parameters**:
  * `session_id` (string, required): Session UUID from `open_page_session`.
* **Returns**:
  ```json
  {
    "image_path": "/absolute/path/to/artifacts/full_page_123456789_abcd1234.png",
    "width": 1280,
    "height": 2450,
    "full_page": true
  }
  ```

#### 3. `capture_viewport_screenshot`
Screenshots only the currently visible viewport at the active scroll position.
* **Parameters**:
  * `session_id` (string, required): Session UUID from `open_page_session`.
* **Returns**:
  ```json
  {
    "image_path": "/absolute/path/to/artifacts/viewport_123456789_abcd1234.png",
    "width": 1280,
    "height": 720
  }
  ```

#### 4. `capture_region_screenshot`
Screenshots a specific DOM element (via selector) or pixel rectangle (via coordinates).
* **Parameters**:
  * `session_id` (string, required): Session UUID from `open_page_session`.
  * `selector` (string, optional): CSS selector of the element. Takes precedence.
  * `x` (number, optional): Clip origin X in px (requires `y`).
  * `y` (number, optional): Clip origin Y in px (requires `x`).
  * `width` (number, optional, default `100`): Clip width in px.
  * `height` (number, optional, default `100`): Clip height in px.
* **Behavior / Errors**:
  * Throws an error if `selector` is provided but not found on the page or lacks a bounding box.
  * Throws an error if coordinate validation fails (e.g. only one of `x` or `y` is provided).
  * Throws an error if neither `selector` nor coordinates are supplied.
* **Returns**:
  ```json
  {
    "image_path": "/absolute/path/to/artifacts/region_123456789_abcd1234.png",
    "bounds": { "x": 100, "y": 150, "width": 400, "height": 300 },
    "source": "selector:.main-content" // or "coordinates"
  }
  ```

#### 5. `inspect_dom_excerpt`
Gets HTML content for one CSS selector, with character-limit truncation.
* **Parameters**:
  * `session_id` (string, required): Session UUID from `open_page_session`.
  * `selector` (string, optional, default `"body"`): CSS selector to retrieve.
  * `max_chars` (number, optional, default `2000`): Character limit before truncation.
  * `include_outer_html` (boolean, optional, default `false`): `true` for outerHTML, `false` for innerHTML.
* **Returns**:
  * If found:
    ```json
    {
      "source": "body",
      "found": true,
      "excerpt": "<div>...</div>",
      "truncated": false
    }
    ```
  * If not found:
    ```json
    {
      "source": ".missing-selector",
      "found": false
    }
    ```

#### 6. `inspect_layout`
Audits bounding boxes and computed styles (display, visibility, opacity, z-index, overflow) per selector.
* **Parameters**:
  * `session_id` (string, required): Session UUID.
  * `selectors` (array of strings, required): CSS selectors to inspect.
* **Returns**:
  ```json
  {
    "inspected_count": 2,
    "items": [
      {
        "selector": ".card",
        "found": true,
        "bounds": { "x": 50, "y": 120, "width": 300, "height": 200 },
        "styles": {
          "display": "block",
          "visibility": "visible",
          "opacity": "1",
          "zIndex": "auto",
          "overflow": "hidden"
        }
      },
      {
        "selector": "#not-found",
        "found": false
      }
    ]
  }
  ```

#### 7. `capture_page_snapshot`
Generates a token-efficient DOM outline showing element hierarchy, tag, ID, classes, and text preview.
* **Parameters**:
  * `session_id` (string, required): Session UUID.
  * `max_nodes` (number, optional, default `100`): Max DOM nodes to outline.
* **Returns**:
  ```json
  {
    "node_count": 5,
    "summary": "Page snapshot with 5 nodes (capped at 100)",
    "excerpt": [
      {
        "tag": "html",
        "id": "",
        "classes": [],
        "text_preview": ""
      },
      {
        "tag": "body",
        "id": "content",
        "classes": ["dark"],
        "text_preview": "Hello world!"
      }
    ]
  }
  ```

#### 8. `close_page_session`
Closes the Playwright browser context and releases all session resources.
* **Parameters**:
  * `session_id` (string, required): Session UUID to close.
* **Returns**:
  ```json
  {
    "session_id": "uuid-string-here",
    "closed": true
  }
  ```

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
- **Token Usage**: Is the `capture_page_snapshot` tool descriptive enough without dumping raw HTML?

**Create a "Visual & DOM Audit Log" for each tool before closing the session.**
