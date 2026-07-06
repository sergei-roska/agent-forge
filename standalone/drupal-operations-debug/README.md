# Drupal Operations & Debug MCP Server

This server provides tools for runtime diagnostics, operational health inspection, and failure isolation within a Drupal environment.

## Overview
Based on **Spec 05**, this server focuses on high-signal diagnostics while maintaining security and performance. It avoids broad exploration, favoring narrow, filterable outputs to help agents identify root causes of site failures.

## Capabilities
The server implements 10 core diagnostic tools:

### Runtime & Health
- **`debug_runtime_health`**: Composite summary of site operational status, maintenance mode, and critical alerts.
- **`debug_failed_operations`**: Aggregates recent failures across watchdog, queues, cron, and updates into a single "What is broken?" report.
- **`debug_environment_summary`**: Safe diagnostics including Drupal/PHP versions, DB driver, and site path (with secret redaction).

### System Logs & State
- **`debug_watchdog`**: Retrieves bounded, filterable slices of watchdog log entries (severity, type, etc.) or look up a specific entry by **WID (numeric ID)**.
- **`debug_system_log`**: Read the tail (last N lines) of a global system error log file (PHP, Apache, Nginx) for deep fatal error diagnostics.
- **`debug_state_system`**: Safely inspects allowlisted Drupal state keys (e.g., cron_last, install_profile).

### Background Tasks
- **`debug_queue_state`**: Summarizes queue backlogs, item counts, and processing state.
- **`debug_cron_state`**: Provides cron execution history, schedule status, and key configuration.

### Maintenance & DB
- **`debug_cache_state`**: Reports on cache bin health, entry counts, and system invalidations.
- **`debug_update_state`**: Checks for pending database schema updates and entity definition updates.

## Technical Details
- **Architecture**: Domain-driven Node.js/TypeScript server.
- **Engine**: Bridges to Drupal via `Drush php-eval` and direct system `tail` for high-precision registry/log introspection.
- **Performance**: Returns projected metadata arrays for maximum token efficiency and standard MCP envelope compliance.

## Installation & Configuration

To use this server in your MCP client (e.g., Claude Desktop), add the following to your configuration file:

```json
{
  "mcpServers": {
    "drupal-operations-debug": {
      "command": "node",
      "args": [
        "/absolute/path/to/drupal-operations-debug/dist/index.js"
      ]
    }
  }
}
```

*Note: Replace the path with the actual absolute path to your `dist/index.js`.*

## 🧪 AI Agent Verification & Stress Test

If you are an AI agent tasked with verifying this server, follow this protocol strictly:

### 🎯 Objective
Verify the runtime diagnostic precision and failure isolation capabilities of this server.

### 🛠 Sequential Testing Protocol
One tool at a time. No parallel verification.

1. **`debug_runtime_health`**: Run this to get a sitewide baseline. Verify the maintenance mode and alert detection.
2. **`debug_watchdog`**: Test filtering by severity first, then test the **WID lookup** specifically. Verify that the table output is compact.
3. **`debug_system_log`**: Try to read the last 10 lines of `error.log` (or equivalent). Verify the `tail` execution and path handling.
4. **`debug_failed_operations`**: This tool aggregates data. Check if it correctly pulls "trouble" from multiple sources (watchdog + queue + cron).

### 📝 Evaluation Criteria
For each tool:
- **Signal-to-Noise**: Is there any "junk" data in the array?
- **Context Clarity**: Does the tool help you identify the *root cause* of a failure immediately?
- **Safety**: Verify that sensitive state keys are redacted in `debug_state_system`.

**Provide a "Diagnostics Audit Report" for each tool before moving to the next.**
