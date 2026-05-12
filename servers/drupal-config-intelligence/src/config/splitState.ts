import { DrushRunner } from '../runtime/drushRunner.js';

export interface SplitState {
  name: string;
  label: string;
  status: boolean;
  folder: string;
  complete_list: string[];
  partial_list: string[];
  include_count: number;
  exclude_count: number;
}

export class ConfigSplitState {
  constructor(private runner: DrushRunner) {}

  async list(splitName?: string): Promise<SplitState[]> {
    const safeSplitName = (splitName || '').replace(/'/g, "\\'");
    const php = `
      if (!\\Drupal::moduleHandler()->moduleExists('config_split')) return ['splits' => []];
      $storage = \\Drupal::entityTypeManager()->getStorage('config_split');
      $splits = $splitName ? $storage->loadMultiple(['${safeSplitName}']) : $storage->loadMultiple();
      $results = [];
      foreach ($splits as $s) {
        $results[] = [
          'name' => $s->id(),
          'label' => (string)$s->label(),
          'status' => $s->status(),
          'folder' => $s->get('folder'),
          'complete_list' => $s->get('complete_list') ?: [],
          'partial_list' => $s->get('partial_list') ?: [],
          'include_count' => count($s->get('complete_list') ?: []),
          'exclude_count' => count($s->get('partial_list') ?: []),
        ];
      }
      return $results;
    `;
    const result = await this.runner.evaluate(php);
    return Array.isArray(result) ? result : [];
  }
}
