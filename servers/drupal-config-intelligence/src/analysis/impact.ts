import { ConfigDiff } from './diff.js';
import { ConfigDependencies } from './dependencies.js';

export interface ImpactResult {
  target: string;
  impact_summary: string;
  touched_domains: string[];
  risk_level: 'low' | 'medium' | 'high';
  required_followups: string[];
}

export class ConfigImpact {
  constructor(private diff: ConfigDiff, private deps: ConfigDependencies) {}

  async analyze(name: string): Promise<ImpactResult> {
    const diffRes = await this.diff.compare(name);
    const depsRes = await this.deps.trace(name, 1, 'required_by');

    const touchedDomains: string[] = [];
    if (name.startsWith('field.')) touchedDomains.push('data_schema');
    if (name.startsWith('views.view.')) touchedDomains.push('ui_display');
    if (name.startsWith('core.extension')) touchedDomains.push('module_lifecycle');

    const followups: string[] = [];
    if (diffRes.risk_level === 'high') followups.push('Manual database backup verification recommended');
    if (depsRes.required_by.length > 0) followups.push(`Verify dependent objects: ${depsRes.required_by.slice(0, 3).join(', ')}...`);

    return {
      target: name,
      impact_summary: `Deployment of ${name} is ${diffRes.status}. It has ${depsRes.required_by.length} dependents.`,
      touched_domains: touchedDomains,
      risk_level: diffRes.risk_level,
      required_followups: followups
    };
  }
}
