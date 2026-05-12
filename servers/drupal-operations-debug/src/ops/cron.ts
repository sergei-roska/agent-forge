import { DrushRunner } from '../runtime/drushRunner.js';

export class CronAdapter {
  constructor(private runner: DrushRunner) {}

  async getCronState(params: { include_recent_runs?: boolean }) {
    const php = `
      $last_run = \\Drupal::state()->get('system.cron_last');
      
      $status = 'OK';
      $now = time();
      
      if (!$last_run) {
        $status = 'NEVER_RUN';
      } elseif ($now - $last_run > 86400) {
        $status = 'STALE_OVER_24H';
      }

      $data = [
        'last_run' => $last_run ? date('Y-m-d\\\\TH:i:sP', $last_run) : null,
        'status' => $status,
      ];
      
      // Cooperative lock: if another request holds "cron", acquire(..., 0) fails.
      $lock = \\Drupal::lock();
      $could_acquire = $lock->acquire('cron', 0.0);
      $data['is_running'] = !$could_acquire;
      if ($could_acquire) {
        $lock->release('cron');
      }

      return $data;
    `;

    return await this.runner.evaluateWithParams(php, params);
  }
}
