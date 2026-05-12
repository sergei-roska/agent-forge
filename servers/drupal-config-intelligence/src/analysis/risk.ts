import { ConfigDrift } from './drift.js';
import { ConfigSplitState } from '../config/splitState.js';

export interface RiskResult {
  summary: string;
  highest_risk_items: string[];
  blockers: string[];
  suggested_checks: string[];
}

export class DeploymentRisk {
  constructor(private drift: ConfigDrift, private splits: ConfigSplitState) {}

  async summarize(): Promise<RiskResult> {
    const driftRes = await this.drift.detect();
    const splitRes = await this.splits.list();

    const riskItems: string[] = [];
    const blockers: string[] = [];
    const checks: string[] = ['Check if all config is exported to sync storage.'];

    if (driftRes.drift_count === null) {
      blockers.push('Drift detection failed due to Drush bootstrap failure.');
    } else {
      for (const item of driftRes.items) {
        if (item.name.includes('field.storage') || item.name.includes('core.extension')) {
          riskItems.push(item.name);
        }
      }
    }

    const activeSplits = splitRes.filter(s => s.status).map(s => s.name);
    if (activeSplits.length > 0) {
      checks.push(`Verify split-specific config for: ${activeSplits.join(', ')}`);
    }

    let summary = `Found ${driftRes.drift_count ?? 'unknown'} items drifting.`;
    if (blockers.length > 0) summary = `INCOMPLETE: ${blockers[0]}`;

    return {
      summary,
      highest_risk_items: riskItems,
      blockers,
      suggested_checks: checks
    };
  }
}
