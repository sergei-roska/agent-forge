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
| `summarize_code_inventory` | Narrative overview of the codebase architecture. |

## 🚀 Quick Start (Forge)

```bash
# From the root of agent-forge
npm install
cd servers/drupal-codebase-introspect
npm run build
```

## 🛠 MCP Client Configuration

To use this server in your MCP client (e.g., Claude Desktop), add the following to your configuration file:

```json
{
  "mcpServers": {
    "drupal-codebase-introspect": {
      "command": "node",
      "args": [
        "/absolute/path/to/drupal-codebase-introspect/dist/index.js"
      ]
    }
  }
}
```

*Note: Replace the path with the actual absolute path to your `dist/index.js`.*

## 🧪 AI Agent Verification & Stress Test

If you are an AI agent tasked with verifying this server, follow this protocol strictly:

### 🎯 Objective
Validate the accuracy, performance, and token efficiency of each tool in a live Drupal environment.

### 🛠 Sequential Testing Protocol
Do **NOT** test all tools at once. Focus on one tool at a time, complete its verification, and then move to the next.

1. **`list_custom_modules`**: Run this first to identify the "playing field". Select 2-3 custom modules for further testing.
2. **`find_hook_implementations`**: Pick a common hook (e.g., `hook_node_view`) and verify it finds correct files/lines.
3. **`trace_runtime_to_code`**: This is the core "Intelligent" tool. Test it with a service ID and a Route name to ensure it bridges symbols to files correctly.
4. **`summarize_code_inventory`**: Evaluate the narrative quality. Does it give a helpful overview or just dry lists?

### 📝 Evaluation Criteria
For each tool, provide feedback on:
- **Accuracy**: Did it find the correct file/line/symbol?
- **Token Noise**: Is the output too verbose? Could it be more projected?
- **Error Handling**: What happens if you pass a non-existent hook or service?
- **Speed**: Does the Drush execution feel responsive?

**Report your findings as a "Tool Verification Log" before proceeding to the next server.**

### Automatic Path Discovery

The server automatically identifies the Drupal root by looking for:
1. `web/core`
2. `docroot/core`
3. `./core` + `./index.php` (Root-based install)
