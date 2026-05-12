import { DrushRunner } from '../runtime/drushRunner.js';

export class EnvironmentAdapter {
  constructor(private runner: DrushRunner) {}

  async getEnvironmentSummary(params: { include_runtime_versions?: boolean }) {
    const php = `
      $data = [
        'drupal_version' => \\Drupal::VERSION,
        'maintenance_mode' => \\Drupal::state()->get('system.maintenance_mode') ? 'ON' : 'OFF',
      ];
      
      if (!empty($params['include_runtime_versions'])) {
        $data['php_version'] = PHP_VERSION;
        $data['db_driver'] = \\Drupal::database()->driver();
        $data['cache_backend_default'] = get_class(\\Drupal::cache());
      }
      
      // Ensure we DO NOT return $settings containing passwords or salts
      // Explicit redaction just in case
      return $data;
    `;

    return await this.runner.evaluateWithParams(php, params);
  }
}
