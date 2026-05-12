import { DrushRunner } from '../runtime/drushRunner.js';
import { SyncStorage } from '../config/syncStorage.js';

export interface DriftItem {
  name: string;
  operation: string;
}

export interface DriftResult {
  drift_count: number | null;
  items: DriftItem[];
  ignored_count: number;
  warning?: string;
}

export class ConfigDrift {
  constructor(private runner: DrushRunner, private sync: SyncStorage) {}

  async detect(prefix?: string): Promise<DriftResult> {
    const safePrefix = (prefix || '').replace(/'/g, "\\'");
    try {
      const php = `
        $prefix = '${safePrefix}';
        $manager = \\Drupal::service('config.manager');
        $sync = \\Drupal::service('config.storage.sync');
        $active = \\Drupal::service('config.storage');
        
        $comparer = new \\Drupal\\Core\\Config\\StorageComparer($sync, $active);
        $comparer->createChangelist();
        $changelist = $comparer->getChangelist();
        
        $results = [];
        foreach ($changelist as $op => $items) {
          foreach ($items as $name) {
            if ($prefix && strpos($name, $prefix) !== 0) continue;
            $results[] = ['name' => $name, 'operation' => $op];
          }
        }
        return ['items' => $results, 'drift_count' => count($results), 'ignored_count' => 0];
      `;
      const result = await this.runner.evaluate(php);
      return result;
    } catch (error: any) {
      return {
        drift_count: null,
        items: [],
        ignored_count: 0,
        warning: `Drift detection failed: ${error.message}`
      };
    }
  }
}
