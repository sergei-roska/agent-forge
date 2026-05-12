import { DrushRunner } from '../runtime/drushRunner.js';

export class QueuesAdapter {
  constructor(private runner: DrushRunner) {}

  async getQueueState(params: {
    queue_name?: string;
    include_claimed?: boolean;
    include_failed_samples?: boolean;
  }) {
    const php = `
      $queue_name = $params['queue_name'] ?? null;
      
      $query = \\Drupal::database()->select('queue', 'q');
      $query->addExpression('q.name', 'queue_name');
      $query->addExpression('COUNT(q.item_id)', 'item_count');
      $query->addExpression('MIN(q.created)', 'oldest_item_timestamp');
      
      if (!empty($params['include_claimed'])) {
        $query->addExpression('SUM(CASE WHEN q.expire > 0 THEN 1 ELSE 0 END)', 'claimed_count');
      }

      if ($queue_name) {
        $query->condition('q.name', $queue_name);
      }
      
      $query->groupBy('q.name');
      
      $results = [];
      try {
        $records = $query->execute();
        foreach ($records as $row) {
          $oldest_age = $row->oldest_item_timestamp ? (time() - $row->oldest_item_timestamp) : 0;
          $data = [
            'queue_name' => (string) $row->queue_name,
            'item_count' => (int) $row->item_count,
            'oldest_item_age_seconds' => $oldest_age,
          ];
          if (!empty($params['include_claimed'])) {
            $data['claimed_count'] = (int) $row->claimed_count;
          }
          $results[] = $data;
        }
      } catch (\\Exception $e) {
        return ['error' => 'Could not query queue table.', 'details' => $e->getMessage()];
      }
      return $results;
    `;

    return await this.runner.evaluateWithParams(php, params);
  }
}
