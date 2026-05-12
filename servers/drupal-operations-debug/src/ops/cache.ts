import { DrushRunner } from '../runtime/drushRunner.js';

export class CacheAdapter {
  constructor(private runner: DrushRunner) {}

  async getCacheState(params: {
    bin?: string;
    include_size_estimate?: boolean;
    include_stale_samples?: boolean;
  }) {
    const php = `
      $bin_filter = $params['bin'] ?? null;
      $include_size = !empty($params['include_size_estimate']);
      
      $bins = $bin_filter ? [$bin_filter] : ['default', 'render', 'config', 'discovery', 'data', 'dynamic_page_cache', 'page'];
      $stats = [];
      $schema = \\Drupal::database()->schema();
      
      foreach ($bins as $b) {
        $table = 'cache_' . $b;
        if ($schema->tableExists($table)) {
          $stat = [
             'bin' => $b
          ];
          
          if ($include_size) {
             $stat['entry_count'] = (int) \\Drupal::database()->select($table)->countQuery()->execute()->fetchField();
             // Invalidation ratio approximation
             $invalidated = (int) \\Drupal::database()->select($table, 'c')->condition('expire', 0, '!=')->condition('expire', time(), '<')->countQuery()->execute()->fetchField();
             $stat['stale_count'] = $invalidated;
             if ($stat['entry_count'] > 0) {
                $stat['invalidation_ratio'] = round($invalidated / $stat['entry_count'], 4);
             }
          } else {
             $stat['status'] = 'EXISTS';
          }
          $stats[] = $stat;
        }
      }
      return $stats;
    `;

    return await this.runner.evaluateWithParams(php, params);
  }
}
