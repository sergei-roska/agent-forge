# Drupal Operations & Debug MCP Server

This server provides tools for runtime diagnostics, operational health inspection, and failure isolation within a Drupal environment.

## Overview

Based on **Spec 05**, this server focuses on high-signal diagnostics while maintaining security and performance. It avoids broad exploration, favoring narrow, filterable outputs to help agents identify root causes of site failures.

## Capabilities

The server implements **9 core diagnostic tools**:

### Runtime & Health
- **`debug_runtime_health`**: Composite health check across maintenance mode, pending DB/entity updates, and cron status. Returns `health_status` (`OK`/`WARNING`), `alerts[]`, and optionally `domains{}` and `next_steps[]`.
- **`debug_failed_operations`**: Cross-domain failure scan aggregating watchdog errors, stale queues, cron anomalies, and pending updates into a single `{total_failures, failures[]}` report.
- **`debug_environment_summary`**: Safe runtime snapshot returning `drupal_version` and `maintenance_mode` always. With `include_runtime_versions=true`, also returns `php_version`, `db_driver`, and `cache_backend_default`. No secrets or settings values are ever returned.

### System Logs & State
- **`debug_watchdog`**: Queries the watchdog DB table. Returns rows with fields: `event_id`, `timestamp`, `severity` (int), `type`, `message` (rendered, HTML-stripped). Supports filtering by `wid` (exact entry lookup), `severity` (exact syslog level 0–7), `type`, `query` (LIKE on message), `since`, `until`, `uid`, `request_id`. Default limit 50, max 1000. Results ordered by `wid DESC`.
- **`debug_state_system`**: Reads Drupal state keys from an allowlist. Non-allowlisted keys are silently dropped. Supports direct key lookup, prefix scan, and preset profiles (`cron`, `maintenance`, `update`).

### Background Tasks
- **`debug_queue_state`**: Reports `queue_name`, `item_count`, and `oldest_item_age_seconds` per queue. With `include_claimed=true`, also returns `claimed_count` (items with `expire > 0`).
- **`debug_cron_state`**: Returns `last_run` (ISO-8601 or null), `status` (`OK` / `NEVER_RUN` / `STALE_OVER_24H`), and `is_running` (cooperative lock probe result).

### Maintenance & DB
- **`debug_cache_state`**: Inspects cache bins. Without `include_size_estimate`, returns `{bin, status: "EXISTS"}` per bin. With `include_size_estimate=true`, returns `{bin, entry_count, stale_count, invalidation_ratio}`.
- **`debug_update_state`**: Returns `{pending_schema_updates: {module: [update_numbers]}, pending_entity_updates: bool}`. With `include_pending=true`, also includes a `details` map.

## Common Parameter

All tools accept an optional `project_root` parameter:

| Parameter | Type | Description |
|---|---|---|
| `project_root` | `string` (optional) | Absolute path to the Drupal project root (the directory containing `composer.json`). Defaults to `process.cwd()`. Required when the MCP server process runs outside the project directory. |

## Tool Reference

### `debug_watchdog`

Query watchdog DB logs for errors, PHP exceptions, or cron failures.

**Input parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project_root` | string | No | See [Common Parameter](#common-parameter). |
| `wid` | number | No | Exact watchdog row ID. When set, all other filters are ignored. |
| `severity` | string | No | Exact syslog level as string: `"0"`=emergency … `"3"`=error … `"7"`=debug. Exact match only — no range filtering. |
| `type` | string | No | Log channel. Exact match. Examples: `php`, `system`, `cron`. |
| `query` | string | No | Substring match on the rendered message (SQL `LIKE`). |
| `since` | string | No | Minimum timestamp. Unix int or `strtotime` expression (e.g. `"-1 day"`). |
| `until` | string | No | Maximum timestamp. Unix int or `strtotime` expression. |
| `uid` | number | No | Drupal user ID. Exact match. |
| `request_id` | string | No | HTTP request ID. Only applied when the `watchdog` table has a `request_id` column. |
| `limit` | number | No | Max rows (1–1000). Default `50`. Results ordered by `wid DESC`. |

**Output fields per row:** `event_id` (int), `timestamp` (ISO-8601), `severity` (int), `type` (string), `message` (rendered, HTML-stripped).

---

### `debug_queue_state`

Inspect Drupal queue backlog from the `queue` DB table.

**Input parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project_root` | string | No | See [Common Parameter](#common-parameter). |
| `queue_name` | string | No | Queue machine name. Omit to list all queues. |
| `include_claimed` | boolean | No | When `true`, adds `claimed_count` (items with `expire > 0`) to each row. |
| `include_failed_samples` | boolean | No | Reserved for future use. Currently has no effect. |

**Output fields per row:** `queue_name`, `item_count` (int), `oldest_item_age_seconds` (int). Plus `claimed_count` (int) when `include_claimed=true`.

---

### `debug_cron_state`

Report cron execution status and lock state.

**Input parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project_root` | string | No | See [Common Parameter](#common-parameter). |
| `include_recent_runs` | boolean | No | Reserved for future use. Currently has no effect. |

**Output fields:** `last_run` (ISO-8601 or `null`), `status` (`OK` / `NEVER_RUN` / `STALE_OVER_24H`), `is_running` (bool, cooperative lock probe).

> **Note on `status` values:**
> - `OK` — cron ran within the last 24 hours.
> - `NEVER_RUN` — `system.cron_last` state key is absent or zero.
> - `STALE_OVER_24H` — last run was more than 86 400 seconds ago.

---

### `debug_cache_state`

Inspect cache bin existence and optional entry statistics.

**Input parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project_root` | string | No | See [Common Parameter](#common-parameter). |
| `bin` | string | No | Cache bin name (e.g. `default`, `render`, `config`). Omit to inspect all primary bins: `default`, `render`, `config`, `discovery`, `data`, `dynamic_page_cache`, `page`. |
| `include_size_estimate` | boolean | No | When `true`, adds `entry_count`, `stale_count`, and `invalidation_ratio` instead of the default `status: "EXISTS"`. |
| `include_stale_samples` | boolean | No | Reserved for future use. Currently has no effect. |

**Output fields per bin (default):** `bin`, `status` (`"EXISTS"`).
**Output fields per bin with `include_size_estimate=true`:** `bin`, `entry_count` (int), `stale_count` (int), `invalidation_ratio` (float, only when `entry_count > 0`).

---

### `debug_update_state`

Detect pending `hook_update_N` and entity definition updates.

**Input parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project_root` | string | No | See [Common Parameter](#common-parameter). |
| `include_pending` | boolean | No | When `true`, adds a `details` map with pending update hook numbers keyed by module name. |
| `include_failed` | boolean | No | Reserved for future use. Currently has no effect. |

**Output fields:** `pending_schema_updates` (object — module name → array of pending update numbers), `pending_entity_updates` (bool). Plus `details` (object) when `include_pending=true`.

---

### `debug_environment_summary`

Safe runtime snapshot of the Drupal environment. Never returns passwords, salts, or settings values.

**Input parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project_root` | string | No | See [Common Parameter](#common-parameter). |
| `include_runtime_versions` | boolean | No | When `true`, adds `php_version`, `db_driver`, and `cache_backend_default` to the response. |

**Output fields (always):** `drupal_version` (string), `maintenance_mode` (`"ON"` / `"OFF"`).
**Output fields with `include_runtime_versions=true`:** additionally `php_version`, `db_driver`, `cache_backend_default`.

---

### `debug_state_system`

Read Drupal state keys from an allowlist. Keys outside the allowlist or `system.*` prefix are silently dropped.

**Static allowlist:** `system.cron_last`, `system.maintenance_mode`, `node.type_settings`, `install_profile`, `install_time`, `update_last_check`, `update_last_email_notification`. Any key beginning with `system.` is also permitted.

**Input parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project_root` | string | No | See [Common Parameter](#common-parameter). |
| `keys` | string[] | No | Explicit state key names. Keys not matching the allowlist or `system.*` prefix are silently dropped. |
| `prefix` | string | No | Prefix scan on the `key_value` state collection. Results are still filtered by the allowlist / `system.*` rule. |
| `allowlist_profile` | string | No | Preset key bundle: `cron` (reads `system.cron_last`), `maintenance` (reads `system.maintenance_mode`), `update` (reads `update_last_check`, `update_last_email_notification`). |

**Output:** Object mapping valid key names to their state values. Returns `{error: "No valid state keys provided or allowed."}` when no valid keys can be resolved.

---

### `debug_runtime_health`

Aggregate health check: maintenance mode, pending schema/entity updates, and cron status.

**Input parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project_root` | string | No | See [Common Parameter](#common-parameter). |
| `include_domains` | boolean | No | When `true`, embeds the raw `envData`, `updatesData`, and `cronData` payloads under a `domains` key. |
| `include_recommendations` | boolean | No | When `true`, adds a `next_steps` array with actionable repair hints for each detected alert. |

**Output fields (always):** `health_status` (`"OK"` / `"WARNING"`), `alerts` (string[]).
**Output fields (conditional):** `domains` (object) when `include_domains=true`; `next_steps` (string[]) when `include_recommendations=true`.

---

### `debug_failed_operations`

Cross-domain failure scan. Checks watchdog (exact severity match at `severity_threshold`), stale queues (items older than 24 h), cron (non-OK status), and pending updates.

> **Known limitation:** Watchdog severity filtering is an exact match, not a range. To catch all error-or-worse events, call multiple times with different `severity_threshold` values (0–3) or use `debug_watchdog` directly.

**Input parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project_root` | string | No | See [Common Parameter](#common-parameter). |
| `since` | string | No | Time floor for the watchdog scan. Unix int or `strtotime` expression (e.g. `"-1 day"`). |
| `severity_threshold` | number | No | Watchdog severity level to match. Exact match only. Default `3` (error). 0=emergency … 7=debug. |
| `domains` | string[] | No | Subsystems to include: `watchdog`, `queues`, `cron`, `updates`. Default: all four. |

**Output fields:** `total_failures` (int), `failures` (array of `{domain, timestamp?, message, type?, last_run?, details?}`).

---

## Technical Details

- **Architecture**: Domain-driven Node.js/TypeScript server.
- **Engine**: Bridges to Drupal via `drush php-script` with a temporary PHP file written to the docroot. Supports Lando, DDEV, and bare local environments (auto-detected at runtime by probing `lando version` then `ddev --version`).
- **Security**: Parameters are passed to PHP via base64-encoded JSON, not shell interpolation. Temporary script files are always deleted after execution.
- **Performance**: Returns structured data arrays for maximum token efficiency and standard MCP envelope compliance.

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

## Environment Variables

| Variable | Description |
|---|---|
| `DRUSH_OPTIONS_URI` | Sets `--uri` for Drush (multisite or custom URL). Takes priority over `DRUSH_URI`. |
| `DRUSH_URI` | Fallback URI for Drush. |

## 🧭 Interactive Explorer's Journey & Capability Demo

This guided demo walkthrough showcases the power of the Drupal Operations & Debug server. Follow along to experience how an agent or developer explores a Drupal site's operational health, identifies anomalies, and drills down into runtime details using all 9 available tools in a cohesive journey.

### 1. The Landing: Environment Discovery
Your journey starts with safe discovery. You want to understand the environment you are inspecting without exposing passwords or secret keys.

*   **Action**: Call `debug_environment_summary` with `include_runtime_versions: true`.
*   **Discovery**: Instantly see the exact Drupal version, PHP version, database driver, cache backend, and whether maintenance mode is active.

### 2. The Radar: Sitewide Health Scan
Next, perform a quick high-level audit to see if the site requires immediate attention.

*   **Action**: Call `debug_runtime_health` with `include_recommendations: true`.
*   **Discovery**: Check the aggregated `health_status` and look at `alerts`. The `next_steps` suggestions provide actionable hints for any warning states, guiding your exploration.

### 3. The Scout: Domain-Wide Failure Probe
Now, inspect the site for any hidden issues across its subsystems.

*   **Action**: Call `debug_failed_operations` with a `since` value (e.g., `"-1 day"`).
*   **Discovery**: Get an aggregated overview of issues spanning database logs, background tasks, cron status, and pending updates, consolidated into a single failure list.

### 4. The Detective: Deep-Dive Log Inspection
If any warnings appeared in the database logs during your scan, it is time to investigate them directly in the watchdog logs.

*   **Action**: Call `debug_watchdog` with `severity: "3"` (errors) or filter with a search `query`.
*   **Discovery**: Retrieve clean, HTML-stripped log messages with accurate timestamps. To isolate a specific issue, take a row's `event_id` and query it using the `wid` filter.

### 5. The Pulse: Cron Heartbeat Check
Background tasks are the heartbeat of Drupal. Let's make sure the cron runner is healthy.

*   **Action**: Call `debug_cron_state`.
*   **Discovery**: Verify when cron last ran, check if the execution status is `OK` or stale, and inspect `is_running` to see if a background cron run is currently holding the cooperative lock.

### 6. The Conveyor: Queue Backlog Analysis
If cron is running, check what tasks are waiting in the queue to be processed.

*   **Action**: Call `debug_queue_state` with `include_claimed: true`.
*   **Discovery**: See a list of active queues, their backlog sizes (`item_count`), the age of the oldest pending item, and how many items are currently claimed/locked by workers.

### 7. The Blueprint: Database Schema Status
Next, let's verify if the site's codebase is in sync with its database schema.

*   **Action**: Call `debug_update_state` with `include_pending: true`.
*   **Discovery**: Learn if there are any pending database updates (`hook_update_N`) or entity definition changes waiting to be applied, grouped by module.

### 8. The Engine: Cache Bin Analysis
Inspect how data caching is performing.

*   **Action**: Call `debug_cache_state` with `include_size_estimate: true`.
*   **Discovery**: Analyze key cache bins (like `default`, `render`, `config`) to see entry counts, stale items, and the cache invalidation ratio, helping identify cache bloat or high invalidation rates.

### 9. The Archives: System State Query
Conclude your exploration by inspecting key Drupal settings stored in the system state engine.

*   **Action**: Call `debug_state_system` using the `allowlist_profile: "cron"`, or specify explicit keys.
*   **Discovery**: Read variables like `system.cron_last` or `system.maintenance_mode`. Notice how keys outside the safe allowlist are automatically and silently ignored to guarantee runtime security.
