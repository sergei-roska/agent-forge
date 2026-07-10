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

## 🚀 Installation & Configuration

### Via npm (Recommended)

1. Install the server globally:
   ```bash
   npm install -g @drupal-forge/server-web-observe-capture
   ```

2. Add the following to your MCP client configuration (e.g., `claude_desktop_config.json` or Cursor settings):
   ```json
   {
     "mcpServers": {
       "web-observe-capture": {
         "command": "npx",
         "args": [
           "-y",
           "@drupal-forge/server-web-observe-capture"
         ]
       }
     }
   }
   ```

*Note: Playwright requires browsers to be installed. You may need to run `npx playwright install chromium` if it is not already installed.*

## 🎬 Exploratory Demo Scenario

Follow this step-by-step developer journey to explore the visual observation, structural analysis, layout debugging, and screenshot capture capabilities of the Web Observe & Capture server. This demo showcases how to inspect page hierarchy, analyze element positions, and capture high-fidelity visual context for front-end understanding.

### 1. Initiating the Interactive Browser Session

To begin exploring, establish a persistent browser context for your target web page. This session preserves page state, cookies, and login configurations across subsequent requests.

> [!TIP]
> Prior to opening the session, the agent should dynamically inspect the local workspace to extract the site URL (e.g., by querying local dev configurations like `lando info` or `ddev describe` if available). Fall back to `https://example.com` if no local URL can be determined.

- **Tool:** `open_page_session`
  - **Parameters:**
    ```json
    {
      "url": "https://my-local-project.ddev.site", // dynamically determined local URL, fallback: "https://example.com"
      "wait_until": "networkidle",
      "width": 1280,
      "height": 720
    }
    ```
  - **Insight:** This tool launches a browser instance, navigates to the URL, and yields a `session_id` to link all upcoming interactions to the same session.

---

### 2. Inspecting the Page's Structural Outline

Before requesting full screenshots or parsing large chunks of HTML, retrieve a lightweight outline of the page's structure. This saves token budget and clarifies layout organization.

- **Tool:** `capture_page_snapshot`
  - **Parameters:**
    ```json
    {
      "session_id": "YOUR_SESSION_UUID",
      "max_nodes": 50
    }
    ```
  - **Insight:** You receive a structured hierarchy of critical DOM nodes including tag names, IDs, CSS classes, and preview text, offering a quick understanding of the page layout.

---

### 3. Deep-Diving Into Target HTML Excerpts

When you locate a specific element (like a header, card, or dashboard section) in the outline, fetch its precise inner or outer HTML block.

- **Tool:** `inspect_dom_excerpt`
  - **Parameters:**
    ```json
    {
      "session_id": "YOUR_SESSION_UUID",
      "selector": "main section.features",
      "max_chars": 1500,
      "include_outer_html": true
    }
    ```
  - **Insight:** This tool retrieves the specific node's HTML content. If the content exceeds your character budget, it truncates gracefully with a `truncated: true` flag.

---

### 4. Auditing Layout Styles and Coordinates

If you are inspecting layout alignment, margins, or element overlays, retrieve the computed layout details and visibility properties.

- **Tool:** `inspect_layout`
  - **Parameters:**
    ```json
    {
      "session_id": "YOUR_SESSION_UUID",
      "selectors": ["header.navigation", "main section.features"]
    }
    ```
  - **Insight:** This tool returns the exact coordinates, width, height, and CSS alignment properties (visibility, display, overflow, opacity, z-index) for the queried selectors.

---

### 5. Capturing Visual Screenshots

Now let's capture visual images of the page. You can capture the active viewport, the entire scrollable document, or crop specifically to a given element.

- **Tool:** `capture_viewport_screenshot`
  - **Parameters:**
    ```json
    {
      "session_id": "YOUR_SESSION_UUID"
    }
    ```
  - **Insight:** Captures exactly what is visible in the current browser viewport.

- **Tool:** `capture_full_page_screenshot`
  - **Parameters:**
    ```json
    {
      "session_id": "YOUR_SESSION_UUID"
    }
    ```
  - **Insight:** Automatically scrolls and captures the complete document from top to bottom, returning the filesystem path to the saved image.

- **Tool:** `capture_region_screenshot`
  - **Parameters:**
    ```json
    {
      "session_id": "YOUR_SESSION_UUID",
      "selector": "main section.features"
    }
    ```
  - **Insight:** Isolates and crops the screenshot exactly to the bounding box of the specified CSS selector (or coordinates), avoiding surrounding visual clutter.

---

### 6. Closing the Browser Session

When your journey is complete, clean up and release the browser resources.

- **Tool:** `close_page_session`
  - **Parameters:**
    ```json
    {
      "session_id": "YOUR_SESSION_UUID"
    }
    ```
  - **Insight:** Shuts down the browser context, ensuring system memory and resources are immediately reclaimed.
