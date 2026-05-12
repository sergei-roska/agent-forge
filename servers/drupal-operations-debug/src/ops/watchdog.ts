import { DrushRunner } from '../runtime/drushRunner.js';

export class WatchdogAdapter {
  constructor(private runner: DrushRunner) {}

  async getLogs(params: {
    wid?: number;
    severity?: string;
    type?: string;
    query?: string;
    since?: string;
    until?: string;
    request_id?: string;
    uid?: number;
    limit?: number;
  }) {
    const limit = params.limit || 50;

    const php = `
      $query = \\Drupal::database()->select('watchdog', 'w')
        ->fields('w', ['wid', 'uid', 'type', 'message', 'variables', 'severity', 'link', 'location', 'referer', 'hostname', 'timestamp']);

      if (isset($params['wid'])) {
        $query->condition('wid', $params['wid']);
      }
      if (!empty($params['severity'])) {
        $query->condition('severity', $params['severity']);
      }
      if (!empty($params['type'])) {
        $query->condition('type', $params['type']);
      }
      if (!empty($params['request_id']) && \\Drupal::database()->schema()->fieldExists('watchdog', 'request_id')) {
        $query->condition('request_id', $params['request_id']);
      }
      if (isset($params['uid'])) {
        $query->condition('uid', $params['uid']);
      }
      if (!empty($params['query'])) {
        $query->condition('message', '%' . \\Drupal::database()->escapeLike($params['query']) . '%', 'LIKE');
      }
      if (!empty($params['since'])) {
        $since = strtotime($params['since']);
        if ($since !== false) {
          $query->condition('timestamp', $since, '>=');
        }
      }
      if (!empty($params['until'])) {
        $until = strtotime($params['until']);
        if ($until !== false) {
          $query->condition('timestamp', $until, '<=');
        }
      }

      $query->orderBy('wid', 'DESC');
      $query->range(0, $params['limit']);

      $results = [];
      try {
        $records = $query->execute();
        foreach ($records as $row) {
          $vars = @unserialize($row->variables);
          $message = $row->message;
          if (is_array($vars)) {
             // Strip HTML tags for cleaner output and perform replacement
             $message = strip_tags(strtr($message, $vars));
          }
          $results[] = [
            'event_id' => (int) $row->wid,
            'timestamp' => date('Y-m-d\\\\TH:i:sP', $row->timestamp),
            'severity' => (int) $row->severity,
            'type' => (string) $row->type,
            'message' => $message,
            // 'request_id' => isset($row->request_id) ? clone $row->request_id : null,
          ];
        }
      } catch (\\Exception $e) {
        return ['error' => 'Database query failed or watchdog module not installed.', 'details' => $e->getMessage()];
      }
      return $results;
    `;

    return await this.runner.evaluateWithParams(php, { ...params, limit });
  }
}
