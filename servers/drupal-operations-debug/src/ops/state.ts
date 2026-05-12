import { DrushRunner } from '../runtime/drushRunner.js';

export class StateAdapter {
  constructor(private runner: DrushRunner) {}

  async getStateValues(params: {
    keys?: string[];
    prefix?: string;
    allowlist_profile?: string;
  }) {
    const allowlist = [
      'system.cron_last',
      'system.maintenance_mode',
      'node.type_settings',
      'install_profile',
      'install_time',
      'update_last_check',
      'update_last_email_notification'
    ];

    const profiles: Record<string, string[]> = {
      cron: ['system.cron_last'],
      maintenance: ['system.maintenance_mode'],
      update: ['update_last_check', 'update_last_email_notification']
    };

    let keys = params.keys || [];
    
    if (params.allowlist_profile && profiles[params.allowlist_profile]) {
       keys = [...keys, ...profiles[params.allowlist_profile]];
    }
    
    // Simple filter against allowlist or prefix 'system.' (generally safer)
    const validKeys = keys.filter(k => allowlist.includes(k) || k.startsWith('system.'));
    
    if (validKeys.length === 0 && !params.prefix && !params.allowlist_profile) {
      return { error: 'No valid state keys provided or allowed.' };
    }

    const php = `
      $valid_keys = $params['validKeys'] ?? [];
      $prefix = $params['prefix'] ?? null;
      
      $results = [];
      $state = \\Drupal::state();
      
      foreach ($valid_keys as $key) {
        $val = $state->get($key);
        $results[$key] = is_object($val) ? clone $val : $val;
      }
      
      if ($prefix) {
        // Drupal core State API doesn't have a getMultiple by prefix easily, 
        // we'll query the key_value table for the state collection.
        $query = \\Drupal::database()->select('key_value', 'kv')
          ->fields('kv', ['name', 'value'])
          ->condition('collection', 'state')
          ->condition('name', \\Drupal::database()->escapeLike($prefix) . '%', 'LIKE')
          ->execute();
          
        foreach ($query as $row) {
          if (in_array($row->name, $params['allowlist']) || strpos($row->name, 'system.') === 0) {
            $results[$row->name] = @unserialize($row->value);
          }
        }
      }
      return $results;
    `;

    return await this.runner.evaluateWithParams(php, { ...params, validKeys, allowlist });
  }
}
