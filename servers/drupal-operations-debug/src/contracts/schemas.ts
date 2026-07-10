import { z } from 'zod';

// project_root is shared across all tools — used by DrushRunner to locate the Drupal project.
const projectRootField = z.string().optional().describe(
  'Absolute path to the Drupal project root (the directory containing composer.json). ' +
  'Defaults to process.cwd() when omitted. Required when the MCP server runs outside the project directory.'
);

export const WatchdogSchema = z.object({
  project_root: projectRootField,
  wid: z.number().optional().describe('Watchdog row ID (wid). When provided, returns that single entry only; all other filters are ignored.'),
  severity: z.string().optional().describe('Syslog severity level 0–7 as a string. Exact match only (no range). 0=emergency, 3=error, 7=debug.'),
  type: z.string().optional().describe('Log channel. Exact match. Examples: php, system, cron.'),
  query: z.string().optional().describe('Substring match on the rendered message text (SQL LIKE with % wrapping).'),
  since: z.string().optional().describe('Minimum timestamp floor. Accepts a Unix integer or any strtotime-compatible expression (e.g. "-1 day").'),
  until: z.string().optional().describe('Maximum timestamp ceiling. Accepts a Unix integer or any strtotime-compatible expression.'),
  request_id: z.string().optional().describe('HTTP request ID. Only applied when the watchdog table has a request_id column.'),
  uid: z.number().optional().describe('Drupal user ID (uid). Exact match.'),
  limit: z.number().min(1).max(1000).optional().default(50).describe('Maximum rows returned. Default 50, max 1000. Results are ordered by wid DESC.'),
});

export const QueueStateSchema = z.object({
  project_root: projectRootField,
  queue_name: z.string().optional().describe('Queue machine name for filtering. Omit to list all queues.'),
  include_claimed: z.boolean().optional().describe('When true, adds claimed_count (items with expire > 0) to each queue row.'),
  include_failed_samples: z.boolean().optional().describe('Reserved for future use. Currently has no effect on the output.'),
});

export const CronStateSchema = z.object({
  project_root: projectRootField,
  include_recent_runs: z.boolean().optional().describe('Reserved for future use. Currently has no effect on the output.'),
});

export const CacheStateSchema = z.object({
  project_root: projectRootField,
  bin: z.string().optional().describe('Cache bin name to inspect. Examples: default, render, config, discovery, data, dynamic_page_cache, page. Omit to inspect all primary bins.'),
  include_size_estimate: z.boolean().optional().describe('When true, adds entry_count, stale_count, and invalidation_ratio per bin instead of the default EXISTS status.'),
  include_stale_samples: z.boolean().optional().describe('Reserved for future use. Currently has no effect on the output.'),
});

export const UpdateStateSchema = z.object({
  project_root: projectRootField,
  include_pending: z.boolean().optional().describe('When true, adds a details map with pending hook_update_N numbers keyed by module name.'),
  include_failed: z.boolean().optional().describe('Reserved for future use. Currently has no effect on the output.'),
});

export const FailedOperationsSchema = z.object({
  project_root: projectRootField,
  since: z.string().optional().describe('Watchdog time floor for the log scan. Accepts a Unix integer or any strtotime-compatible expression (e.g. "-1 day").'),
  severity_threshold: z.number().optional().describe(
    'Watchdog severity level to include in the failure scan. Exact match only — no range filtering. Default 3 (error). ' +
    '0=emergency, 3=error, 7=debug.'
  ),
  domains: z.array(z.string()).optional().describe(
    'Subsystems to scan. Valid values: watchdog, queues, cron, updates. Default: all four domains.'
  ),
});

export const RuntimeHealthSchema = z.object({
  project_root: projectRootField,
  include_domains: z.boolean().optional().describe('When true, embeds the raw env, updates, and cron payloads under a domains key in the response.'),
  include_recommendations: z.boolean().optional().describe('When true, adds a next_steps array with repair hints for each detected alert.'),
});

export const StateSystemSchema = z.object({
  project_root: projectRootField,
  keys: z.array(z.string()).optional().describe(
    'Explicit state key names to read. Each key must either be in the static allowlist ' +
    '(system.cron_last, system.maintenance_mode, node.type_settings, install_profile, install_time, ' +
    'update_last_check, update_last_email_notification) or start with the "system." prefix. ' +
    'Keys outside these rules are silently dropped.'
  ),
  prefix: z.string().optional().describe(
    'Prefix to scan against the key_value state collection. Results are still filtered through the allowlist / system.* rule.'
  ),
  allowlist_profile: z.string().optional().describe(
    'Preset key bundle to read. Valid values: cron (reads system.cron_last), ' +
    'maintenance (reads system.maintenance_mode), update (reads update_last_check and update_last_email_notification).'
  ),
});

export const EnvironmentSummarySchema = z.object({
  project_root: projectRootField,
  include_runtime_versions: z.boolean().optional().describe('When true, adds php_version, db_driver, and cache_backend_default to the response. These fields are omitted when false (default).'),
});
