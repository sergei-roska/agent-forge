import { DrushRunner } from '../runtime/drushRunner.js';
import { EnvironmentAdapter } from '../ops/environment.js';
import { UpdatesAdapter } from '../ops/updates.js';
import { CronAdapter } from '../ops/cron.js';

export class RuntimeHealthAnalyzer {
  constructor(private runner: DrushRunner) {}

  async analyze(params: {
    include_domains?: boolean;
    include_recommendations?: boolean;
  }) {
    const env = new EnvironmentAdapter(this.runner);
    const updates = new UpdatesAdapter(this.runner);
    const cron = new CronAdapter(this.runner);

    const [envData, updatesData, cronData] = await Promise.all([
      env.getEnvironmentSummary({ include_runtime_versions: true }),
      updates.getUpdateState({}),
      cron.getCronState({})
    ]);

    const alerts: string[] = [];
    const recommendations: string[] = [];

    if (envData.maintenance_mode === 'ON') {
      alerts.push('Site is in Maintenance Mode');
      recommendations.push('Take site out of maintenance mode when debugging is complete using state system.');
    }

    if (updatesData.pending_schema_updates && Object.keys(updatesData.pending_schema_updates).length > 0) {
      alerts.push('Pending DB schema updates');
      recommendations.push('Run drush updb to apply pending database updates.');
    }
    
    if (updatesData.pending_entity_updates) {
      alerts.push('Pending entity updates');
      recommendations.push('Run drush entup or a custom update hook to apply entity updates.');
    }

    if (cronData.status !== 'OK') {
      alerts.push(`Cron status: ${cronData.status}`);
      recommendations.push('Ensure the system cron is triggering Drupal cron regularly.');
    }

    const result: any = {
      health_status: alerts.length > 0 ? 'WARNING' : 'OK',
      alerts
    };

    if (params.include_domains) {
      result.domains = { envData, updatesData, cronData };
    }

    if (params.include_recommendations) {
      result.next_steps = recommendations;
    }

    return result;
  }
}
