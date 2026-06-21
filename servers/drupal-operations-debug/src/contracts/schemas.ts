import { z } from 'zod';

export const WatchdogSchema = z.object({
  wid: z.number().optional().describe('Watchdog row ID (wid). Exact match.'),
  severity: z.string().optional().describe('Exact syslog level 0–7. 0=emergency, 3=error, 7=debug.'),
  type: z.string().optional().describe('Log channel. Examples: php, system, cron.'),
  query: z.string().optional().describe('Substring match on message (SQL LIKE).'),
  since: z.string().optional().describe('Min timestamp. Unix int or strtotime (e.g. "-1 day").'),
  until: z.string().optional().describe('Max timestamp. Unix int or strtotime.'),
  request_id: z.string().optional().describe('HTTP request ID. Requires watchdog.request_id column.'),
  uid: z.number().optional().describe('Drupal user ID (uid).'),
  limit: z.number().min(1).max(1000).optional().default(50).describe('Max rows. Default 50, max 1000.'),
});

export const QueueStateSchema = z.object({
  queue_name: z.string().optional().describe('Queue machine name. Omit to list all queues.'),
  include_claimed: z.boolean().optional().describe('Add claimed_count (items with expire>0).'),
  include_failed_samples: z.boolean().optional().describe('Include failed-item samples when supported.'),
});

export const CronStateSchema = z.object({
  include_recent_runs: z.boolean().optional().describe('Include recent cron run timestamps when available.'),
});

export const CacheStateSchema = z.object({
  bin: z.string().optional().describe('Cache bin name. Examples: default, render, config. Omit = primary bins.'),
  include_size_estimate: z.boolean().optional().describe('Add entry_count, stale_count, invalidation_ratio per bin.'),
  include_stale_samples: z.boolean().optional().describe('Include stale-entry samples when present.'),
});

export const UpdateStateSchema = z.object({
  include_pending: z.boolean().optional().describe('Add details map: pending hook_update_N numbers per module.'),
  include_failed: z.boolean().optional().describe('Include previously failed update hooks when available.'),
});

export const FailedOperationsSchema = z.object({
  since: z.string().optional().describe('Watchdog time floor. Unix int or strtotime (e.g. "-1 day").'),
  severity_threshold: z.number().optional().describe('Watchdog severity filter. Default 3 (error). Exact match.'),
  domains: z.array(z.string()).optional().describe('Subsystems: watchdog, queues, cron, updates. Default: all four.'),
});

export const RuntimeHealthSchema = z.object({
  include_domains: z.boolean().optional().describe('Embed full env, updates, cron payloads under domains.'),
  include_recommendations: z.boolean().optional().describe('Add next_steps repair hints per alert.'),
});

export const StateSystemSchema = z.object({
  keys: z.array(z.string()).optional().describe('State key names. Must match allowlist or system.* prefix.'),
  prefix: z.string().optional().describe('Prefix scan on state key_value rows. Filtered by allowlist rules.'),
  allowlist_profile: z.string().optional().describe('Preset key bundle: cron | maintenance | update.'),
});

export const EnvironmentSummarySchema = z.object({
  include_runtime_versions: z.boolean().optional().describe('Add php_version, db_driver, cache_backend_default.'),
});
