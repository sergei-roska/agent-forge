import { DrupalClient } from '@agent-forge/drupal-api-client';
import { loadConfigFile, listConfigNames } from '@agent-forge/filesystem-index';

export class ConfigAnalysisAdapter {
  constructor(private client: DrupalClient, private configDir: string) {}

  async inspectConfig(configName: string, source: 'active' | 'sync' | 'both') {
    const results: any = {
      config_name: configName,
      warnings: [] as string[],
    };

    if (source === 'active' || source === 'both') {
      // API-only mode: Drupal core does not expose active config objects via a stable public endpoint.
      results.active = null;
      results.warnings.push(
        'Active config introspection is unavailable via standard public Drupal APIs.',
      );
    }

    if (source === 'sync' || source === 'both') {
      results.sync = await loadConfigFile(this.configDir, configName);
    }

    return results;
  }

  async detectDrift(prefix?: string) {
    void this.client;
    const names = await listConfigNames(this.configDir, prefix);
    return {
      mode: 'api-only-limited',
      message:
        'Drift detection between active and sync requires privileged introspection not exposed by standard public Drupal APIs.',
      sync_config_count: names.length,
      prefix: prefix ?? '',
    };
  }

  async getDependencies(configName: string) {
    const sync = await loadConfigFile(this.configDir, configName);
    const data = sync?.data as Record<string, unknown> | undefined;
    const dependencies = (data?.dependencies ?? {}) as Record<string, unknown>;
    return {
      config_name: configName,
      dependencies,
      source: 'config_sync',
    };
  }
}
