import { DrushRunner } from '../runtime/drushRunner.js';
import { SyncStorage } from '../config/syncStorage.js';
import { listConfigNames } from '@agent-forge/filesystem-index';

export interface DependencyResult {
  name: string;
  requires: any;
  required_by: string[];
  truncated?: boolean;
  warning?: string;
  method: 'drush' | 'filesystem_fallback';
}

export class ConfigDependencies {
  constructor(private runner: DrushRunner, private sync: SyncStorage) {}

  async trace(name: string, maxDepth: number = 3, direction: 'requires' | 'required_by' | 'both' = 'both'): Promise<DependencyResult> {
    try {
      const safeName = name.replace(/'/g, "\\'");
      const php = `
        $name = '${safeName}';
        $max_depth = ${maxDepth};
        $config = \\Drupal::config($name);
        if ($config->isNew()) return ['error' => 'Config not found: ' . $name];

        $dependencies = $config->get('dependencies') ?: [];
        $dependents = [];
        
        if ('${direction}' === 'required_by' || '${direction}' === 'both') {
          $all_config = \\Drupal::service('config.storage')->listAll();
          foreach ($all_config as $c_name) {
            $c_data = \\Drupal::service('config.storage')->read($c_name);
            $deps = $c_data['dependencies'] ?? [];
            foreach ($deps as $type => $list) {
              if (is_array($list) && in_array($name, $list)) {
                $dependents[] = $c_name;
                break;
              }
            }
          }
        }

        return [
          'name' => $name,
          'requires' => $dependencies,
          'required_by' => array_unique($dependents),
        ];
      `;
      const result = await this.runner.evaluate(php);
      if (result.error) throw new Error(result.error);
      return { ...result, method: 'drush' };
    } catch (error: any) {
      // Fallback to sync storage
      const config = await this.sync.read(name);
      if (!config) throw new Error(`Config ${name} not found in sync storage, and Drush failed.`);

      const requires = config.dependencies || {};
      const dependents: string[] = [];

      const syncDir = this.sync.getSyncDir();
      if (syncDir) {
        const fileNames = await listConfigNames(syncDir);
        for (const fName of fileNames) {
          if (fName === name) continue;
          const content = await this.sync.read(fName);
          const deps = content?.dependencies || {};
          for (const type of Object.keys(deps)) {
            if (Array.isArray(deps[type]) && deps[type].includes(name)) {
              dependents.push(fName);
              break;
            }
          }
        }
      }

      return {
        name,
        requires,
        required_by: dependents,
        method: 'filesystem_fallback',
        warning: `Drush bootstrap failed: ${error.message}. Results based on sync storage files.`
      };
    }
  }
}
