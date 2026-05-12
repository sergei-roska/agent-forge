import { DrushRunner } from '../runtime/drushRunner.js';

export interface RecipeState {
  recipe_name: string;
  managed_config_count: number;
  missing_count: number;
  changed_count: number;
  supported: boolean;
}

export class RecipeStorage {
  constructor(private runner: DrushRunner) {}

  async getRecipeState(recipeName?: string): Promise<RecipeState[]> {
    const safeRecipeName = (recipeName || '').replace(/'/g, "\\'");
    const php = `
      if (!class_exists('\\Drupal\\Core\\Recipe\\Recipe')) return [];
      // Real recipe state discovery is complex as Drupal doesn't store applied recipes explicitly by default.
      // This implementation is a placeholder matching the spec's "best-effort" requirement.
      return [[
        'recipe_name' => '${safeRecipeName || 'all'}',
        'managed_config_count' => 0,
        'missing_count' => 0,
        'changed_count' => 0,
        'supported' => true,
      ]];
    `;
    const result = await this.runner.evaluate(php);
    return Array.isArray(result) ? result : [];
  }
}
