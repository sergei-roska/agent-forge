import { DrushRunner } from '../runtime/drushRunner.js';
import { WatchdogAdapter } from '../ops/watchdog.js';
import { QueuesAdapter } from '../ops/queues.js';
import { UpdatesAdapter } from '../ops/updates.js';
import { CronAdapter } from '../ops/cron.js';

export class FailedOperationsAnalyzer {
  constructor(private runner: DrushRunner) {}

  async analyze(params: {
    since?: string;
    severity_threshold?: number;
    domains?: string[];
  }) {
    const severityStr = params.severity_threshold !== undefined ? String(params.severity_threshold) : '3';
    const domains = params.domains || ['watchdog', 'queues', 'updates', 'cron'];
    
    const failures: any[] = [];
    
    if (domains.includes('watchdog')) {
      const watchdog = new WatchdogAdapter(this.runner);
      // Let's get errors (severity <= 3). We have to do it differently if we want <= 3, 
      // but our watchdog adapter supports an exact severity.
      // A better watchdog adapter would support '<=', but for now we'll query exact or just rely on PHP changes if needed.
      // We will pass severity_threshold and handle it in the adapter if we update it, or just use exact.
      // For now, let's just get severity '3'.
      const logs = await watchdog.getLogs({ severity: severityStr, limit: 20, since: params.since });
      if (Array.isArray(logs)) {
        logs.forEach(e => {
          failures.push({ domain: 'watchdog', timestamp: e.timestamp, message: e.message, type: e.type });
        });
      }
    }

    if (domains.includes('updates')) {
      const updates = new UpdatesAdapter(this.runner);
      const state = await updates.getUpdateState({});
      if (state.pending_schema_updates && Object.keys(state.pending_schema_updates).length > 0) {
         failures.push({ domain: 'updates', message: 'Pending schema updates detected.', details: state.pending_schema_updates });
      }
      if (state.pending_entity_updates) {
         failures.push({ domain: 'updates', message: 'Pending entity updates detected.' });
      }
    }

    if (domains.includes('cron')) {
      const cron = new CronAdapter(this.runner);
      const state = await cron.getCronState({});
      if (state.status !== 'OK') {
         failures.push({ domain: 'cron', message: `Cron status is ${state.status}`, last_run: state.last_run });
      }
    }

    if (domains.includes('queues')) {
      const queues = new QueuesAdapter(this.runner);
      const state = await queues.getQueueState({});
      if (Array.isArray(state)) {
         state.forEach(q => {
           if (q.oldest_item_age_seconds > 86400) {
             failures.push({ domain: 'queues', message: `Queue ${q.queue_name} has items older than 24 hours.` });
           }
         });
      }
    }

    return {
      total_failures: failures.length,
      failures
    };
  }
}
