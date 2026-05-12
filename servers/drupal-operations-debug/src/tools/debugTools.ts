import { buildEnvelope } from '@agent-forge/mcp-core';
import { DrushRunner } from '../runtime/drushRunner.js';
import { WatchdogAdapter } from '../ops/watchdog.js';
import { QueuesAdapter } from '../ops/queues.js';
import { CronAdapter } from '../ops/cron.js';
import { CacheAdapter } from '../ops/cache.js';
import { UpdatesAdapter } from '../ops/updates.js';
import { EnvironmentAdapter } from '../ops/environment.js';
import { StateAdapter } from '../ops/state.js';
import { FailedOperationsAnalyzer } from '../analysis/failedOperations.js';
import { RuntimeHealthAnalyzer } from '../analysis/runtimeHealth.js';

import {
  WatchdogSchema,
  QueueStateSchema,
  CronStateSchema,
  CacheStateSchema,
  UpdateStateSchema,
  FailedOperationsSchema,
  RuntimeHealthSchema,
  StateSystemSchema,
  EnvironmentSummarySchema
} from '../contracts/schemas.js';

// Helper to find root from args
const getRootDir = (args: any) => args.project_root || process.cwd();

export const debugTools: any[] = [
  {
    name: 'debug_watchdog',
    description: 'Retrieve bounded slices of Drupal log entries with filters.',
    inputSchema: WatchdogSchema.shape,
    handler: async (args: any) => {
      const runner = new DrushRunner(getRootDir(args));
      const adapter = new WatchdogAdapter(runner);
      const data = await adapter.getLogs(args);
      const dataArray = Array.isArray(data) ? data : [data];
      return buildEnvelope({
        summary: `Retrieved ${dataArray.length} log entries.`,
        data: dataArray,
      });
    }
  },
  {
    name: 'debug_queue_state',
    description: 'Summarize queue backlogs and item counts.',
    inputSchema: QueueStateSchema.shape,
    handler: async (args: any) => {
      const runner = new DrushRunner(getRootDir(args));
      const adapter = new QueuesAdapter(runner);
      const data = await adapter.getQueueState(args);
      return buildEnvelope({
        summary: 'Summarized active Drupal queues.',
        data: Array.isArray(data) ? data : [data],
      });
    }
  },
  {
    name: 'debug_cron_state',
    description: 'Check cron execution history and status.',
    inputSchema: CronStateSchema.shape,
    handler: async (args: any) => {
      const runner = new DrushRunner(getRootDir(args));
      const adapter = new CronAdapter(runner);
      const data = await adapter.getCronState(args);
      return buildEnvelope({
        summary: 'Retrieved site cron metrics.',
        data: [data],
      });
    }
  },
  {
    name: 'debug_cache_state',
    description: 'Summarize cache bin health and sizes.',
    inputSchema: CacheStateSchema.shape,
    handler: async (args: any) => {
      const runner = new DrushRunner(getRootDir(args));
      const adapter = new CacheAdapter(runner);
      const data = await adapter.getCacheState(args);
      return buildEnvelope({
        summary: `Cache state for ${args.bin || 'primary bins'}.`,
        data: Array.isArray(data) ? data : [data],
      });
    }
  },
  {
    name: 'debug_update_state',
    description: 'Check for pending schema or entity updates.',
    inputSchema: UpdateStateSchema.shape,
    handler: async (args: any) => {
       const runner = new DrushRunner(getRootDir(args));
       const adapter = new UpdatesAdapter(runner);
       const data = await adapter.getUpdateState(args);
       return buildEnvelope({
         summary: 'Checked for pending database updates.',
         data: [data],
       });
    }
  },
  {
    name: 'debug_environment_summary',
    description: 'Safe system diagnostics (Versions, Drivers, Site Path).',
    inputSchema: EnvironmentSummarySchema.shape,
    handler: async (args: any) => {
       const runner = new DrushRunner(getRootDir(args));
       const adapter = new EnvironmentAdapter(runner);
       const data = await adapter.getEnvironmentSummary(args);
       return buildEnvelope({
         summary: `Drupal ${data.drupal_version}${data.php_version ? ` on PHP ${data.php_version}` : ''}`,
         data: [data],
       });
    }
  },
  {
    name: 'debug_state_system',
    description: 'Inspect selected Drupal state keys (security allowlisted).',
    inputSchema: StateSystemSchema.shape,
    handler: async (args: any) => {
       const runner = new DrushRunner(getRootDir(args));
       const adapter = new StateAdapter(runner);
       const data = await adapter.getStateValues(args);
       return buildEnvelope({
         summary: (data as any).error ? 'Access denied or no valid keys.' : 'Retrieved state keys.',
         data: [data],
       });
    }
  },
  {
    name: 'debug_runtime_health',
    description: 'Compact operational health summary with drill-down pointers.',
    inputSchema: RuntimeHealthSchema.shape,
    handler: async (args: any) => {
      const runner = new DrushRunner(getRootDir(args));
      const analyzer = new RuntimeHealthAnalyzer(runner);
      const health = await analyzer.analyze(args);

      return buildEnvelope({
        summary: `Site Health: ${health.alerts.length > 0 ? 'Issues detected' : 'Operational'}`,
        data: [health],
      });
    }
  },
  {
    name: 'debug_failed_operations',
    description: 'Aggregate recent failures across watchdog, queues, cron, and updates.',
    inputSchema: FailedOperationsSchema.shape,
    handler: async (args: any) => {
      const runner = new DrushRunner(getRootDir(args));
      const analyzer = new FailedOperationsAnalyzer(runner);
      const result = await analyzer.analyze(args);

      return buildEnvelope({
        summary: `Found ${result.total_failures} operational failure indicators.`,
        data: [result],
      });
    }
  }
];
