import { z } from 'zod';

export const WatchdogSchema = z.object({
  wid: z.number().optional().describe('Lookup a specific log entry by its numeric ID (WID).'),
  severity: z.string().optional().describe('Severity level (0-7, where 0 is emergency, 3 is error).'),
  type: z.string().optional().describe('Filter by log type (e.g. php, system, cron).'),
  query: z.string().optional().describe('Text search within the log message.'),
  since: z.string().optional().describe('Filter events newer than this timestamp or relative time (e.g., "-1 day").'),
  until: z.string().optional().describe('Filter events older than this timestamp or relative time.'),
  request_id: z.string().optional().describe('Filter by specific HTTP request ID.'),
  uid: z.number().optional().describe('Filter by user ID.'),
  limit: z.number().min(1).max(1000).optional().default(50).describe('Max entries to return (default 50, max 1000).')
});

export const QueueStateSchema = z.object({
  queue_name: z.string().optional().describe('Specific queue to inspect.'),
  include_claimed: z.boolean().optional().describe('Include counts for items currently claimed by workers.'),
  include_failed_samples: z.boolean().optional().describe('Include samples of failed items if supported.')
});

export const CronStateSchema = z.object({
  include_recent_runs: z.boolean().optional().describe('Include recent cron run timestamps.')
});

export const CacheStateSchema = z.object({
  bin: z.string().optional().describe('Specific cache bin to inspect (e.g., default, render).'),
  include_size_estimate: z.boolean().optional().describe('Include an estimated row count or memory footprint.'),
  include_stale_samples: z.boolean().optional().describe('Include examples of stale entries if present.')
});

export const UpdateStateSchema = z.object({
  include_pending: z.boolean().optional().describe('Include detailed list of pending updates.'),
  include_failed: z.boolean().optional().describe('Include information on previously failed update hooks.')
});

export const FailedOperationsSchema = z.object({
  since: z.string().optional().describe('Filter failures newer than this timestamp or relative time (e.g., "-1 day").'),
  severity_threshold: z.number().optional().describe('Severity threshold for watchdog (default 3 - Error).'),
  domains: z.array(z.string()).optional().describe('Which domains to check (watchdog, queue, cron, updates).')
});

export const RuntimeHealthSchema = z.object({
  include_domains: z.boolean().optional().describe('Include detailed sub-domain health checks.'),
  include_recommendations: z.boolean().optional().describe('Include actionable recommendations for identified issues.')
});

export const StateSystemSchema = z.object({
  keys: z.array(z.string()).optional().describe('Specific state keys to look up.'),
  prefix: z.string().optional().describe('Lookup keys matching a prefix.'),
  allowlist_profile: z.string().optional().describe('Pre-defined profile of state keys (e.g. "cron", "maintenance").')
});

export const EnvironmentSummarySchema = z.object({
  include_runtime_versions: z.boolean().optional().describe('Include detailed PHP/Drupal/DB version strings.')
});
