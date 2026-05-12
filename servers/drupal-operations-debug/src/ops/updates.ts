import { DrushRunner } from '../runtime/drushRunner.js';

export class UpdatesAdapter {
  constructor(private runner: DrushRunner) {}

  async getUpdateState(params: {
    include_pending?: boolean;
    include_failed?: boolean;
  }) {
    const php = `
      \\Drupal::moduleHandler()->loadInclude('system', 'inc', 'system.install');
      $data = [
        'pending_schema_updates' => [],
        'pending_entity_updates' => false,
      ];

      // Drupal 9+ (required for Drupal 11): schema pending via UpdateHookRegistry.
      // update_get_update_list() was removed; do not require update.inc.
      $registry = \\Drupal::service('update.update_hook_registry');
      $details = [];

      foreach (array_keys(\\Drupal::moduleHandler()->getModuleList()) as $module) {
        $available = $registry->getAvailableUpdates($module);
        if (empty($available)) {
          continue;
        }
        $installed = $registry->getInstalledVersion($module);
        if ($installed === -1) {
          continue;
        }
        $pending_numbers = array_values(array_filter($available, function ($v) use ($installed) {
          return $v > $installed;
        }));
        if (!empty($pending_numbers)) {
          $data['pending_schema_updates'][$module] = $pending_numbers;
          $details[$module] = ['pending' => array_fill_keys($pending_numbers, '')];
        }
      }

      if (class_exists('\\\\Drupal\\\\Core\\\\Entity\\\\EntityDefinitionUpdateManager')) {
        $change_summary = \\Drupal::entityDefinitionUpdateManager()->getChangeSummary();
        $data['pending_entity_updates'] = !empty($change_summary);
      }

      if (!empty($params['include_pending'])) {
         $data['details'] = $details;
      }

      return $data;
    `;

    return await this.runner.evaluateWithParams(php, params);
  }
}
