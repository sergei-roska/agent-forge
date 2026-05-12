import { DrushRunner } from '../runtime/drushRunner.js';

export interface ActiveConfig {
  name: string;
  data: any;
  overrides?: any;
}

export class ActiveStorage {
  constructor(private runner: DrushRunner) {}

  async read(name: string, includeOverrides: boolean = true): Promise<ActiveConfig | null> {
    const safeName = name.replace(/'/g, "\\'");
    const php = `
      $name = '${safeName}';
      $config = \\Drupal::config($name);
      if ($config->isNew()) return null;
      $results = [
        'name' => $name,
        'data' => $config->getRawData(),
      ];
      if (${includeOverrides ? 'true' : 'false'}) {
        $results['overrides'] = $config->get();
      }
      return $results;
    `;
    const result = await this.runner.evaluate(php);
    return result || null;
  }

  async list(prefix?: string): Promise<string[]> {
    const safePrefix = (prefix || '').replace(/'/g, "\\'");
    const php = `
      $prefix = '${safePrefix}';
      return \\Drupal::service('config.storage')->listAll($prefix);
    `;
    return await this.runner.evaluate(php) || [];
  }
}
