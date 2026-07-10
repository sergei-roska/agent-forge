# 🔍 Drupal Codebase Introspect (Spec 04)

MCP server for mapping Drupal runtime behaviors to actionable file locations.

## ✨ Features

- **Symbolic Resolution**: Map Hooks, Services, Plugins, and Routes to exact file paths and line numbers.
- **Hook Discovery**: Identify which modules implement specific hooks without noisy Grep.
- **Service & Event Tracking**: Introspect the Symfony Container and Event Dispatcher.
- **Reflective Mapping**: Uses PHP Reflection API for high-precision file/line detection.
- **Heuristic Discovery**: Introspects custom modules, preprocess functions, and Drush commands.
- **Universal Root Detection**: Automatically handles `web/`, `docroot/`, and root-based Drupal installations.

## 🧰 Available Tools (11)

| Tool | Purpose |
|---|---|
| `list_custom_modules` | Find installed custom extensions and their locations. |
| `find_hook_implementations` | Locate where `hook_...` is implemented (File + Line). |
| `find_service_definitions` | Map service IDs to their PHP classes and files. |
| `find_event_subscribers` | Trace which classes handle specific Symfony/Drupal events. |
| `find_plugin_classes` | Locate classes for specific Plugin Types (Blocks, Fields, etc.). |
| `find_form_classes` | Map Form IDs/Classes to their source code. |
| `find_controller_handlers` | Map routes to controllers, methods, and files. |
| `find_preprocess_functions` | Identify preprocess functions for hooks and themes. |
| `find_drush_commands` | Locate classes providing custom Drush commands. |
| `trace_runtime_to_code` | Unified entry point for symbolic-to-file resolution. |
| `summarize_code_inventory` | Structured count of custom modules, services, and routes. Use for initial codebase orientation. |

## 🚀 Installation & Configuration

### Via npm (Recommended)

1. Install the server globally:
   ```bash
   npm install -g @drupal-forge/server-codebase-introspect
   ```

2. Add the following to your MCP client configuration (e.g., `claude_desktop_config.json` or Cursor settings):
   ```json
   {
     "mcpServers": {
       "drupal-codebase-introspect": {
         "command": "npx",
         "args": [
           "-y",
           "@drupal-forge/server-codebase-introspect"
         ]
       }
     }
   }
   ```

## 🗺 Interactive Codebase Exploration (Capabilities Demo)

This interactive scenario demonstrates how to use the server's tools to explore, understand, and navigate a Drupal codebase. Follow this step-by-step walkthrough to discover the power of semantic introspection, simulating how a developer onboarded to a new project builds a complete mental map of its architecture.

### 🧭 Phase 1: Codebase Orientation (Getting the Big Picture)
To start your journey, get a high-level overview of the project's complexity and identify the custom extensions in play.
1. **`summarize_code_inventory`**: Run this first to retrieve a structured summary of custom modules, services, routes, hooks, and plugins. This establishes the scope of the project.
2. **`list_custom_modules`**: Locate all custom modules installed in the environment and see where their files are located. Pick a custom module from the list to focus on in the next steps.

### 🎨 Phase 2: Theme & Render Layers
Examine how the codebase alters output and hooks into the page lifecycle.
3. **`find_hook_implementations`**: Find where hooks (such as `hook_node_view` or `hook_form_alter`) are implemented. Select a hook and view the exact files and lines where the custom behaviors are registered.
4. **`find_preprocess_functions`**: Locate theme preprocess functions that manipulate variables before templates render (e.g., functions preprocessing pages, nodes, or paragraphs).

### ⚙️ Phase 3: Services, Events & Plugins
Dive deeper into the Symfony container and Drupal's extensibility patterns.
5. **`find_service_definitions`**: Map service IDs (e.g., custom services or core services like `current_user`) back to their class definitions and file paths.
6. **`find_event_subscribers`**: Trace which PHP classes are listening to specific events (such as configuration saves or kernel request events).
7. **`find_plugin_classes`**: Discover plugin classes of a specific plugin type (e.g., blocks, migrate source plugins, or field formatters) to understand modular extensions.

### 🖥 Phase 4: Routing, Forms & Console Commands
Understand how users and administrators interact with the codebase.
8. **`find_form_classes`**: Resolve a Form ID (e.g., configuration forms or custom entity forms) to its corresponding PHP class to inspect its submission and validation logic.
9. **`find_controller_handlers`**: Map Drupal route names to their controller classes, methods, and line numbers to see what code executes when a URL is requested.
10. **`find_drush_commands`**: Identify where custom console commands are defined and trace them directly to their implementation classes.

### 🚀 Phase 5: Unified Symbolic Resolution
Experience the ultimate helper that unifies runtime inspections.
11. **`trace_runtime_to_code`**: Pass any arbitrary symbol (a route name, hook name, service ID, or form ID) to this intelligent tool. It automatically determines the symbol type and points you straight to the exact code definition.

---

## 🔍 Drupal Root Discovery

The server automatically identifies the Drupal root directory by looking for:
1. `web/core`
2. `docroot/core`
3. `./core` + `./index.php` (Root-based install)

