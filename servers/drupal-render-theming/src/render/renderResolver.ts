import { DrushRunner } from '../runtime/drushRunner.js';

export class RenderResolver {
  private runner: DrushRunner;

  constructor(rootDir: string) {
    this.runner = new DrushRunner(rootDir);
  }

  /**
   * inspect_theme_state: Summarize active theme and base chain.
   */
  async getThemeState() {
    const php = `
      $theme_manager = \\Drupal::service('theme.manager');
      $active_theme = $theme_manager->getActiveTheme();
      $base_themes = [];
      foreach ($active_theme->getBaseThemeExtensions() as $ext) {
        $base_themes[] = $ext->getName();
      }
      
      return [
        'active_theme' => $active_theme->getName(),
        'admin_theme' => \\Drupal::config('system.theme')->get('admin'),
        'base_theme_chain' => $base_themes,
        'path' => $active_theme->getPath(),
        'region_count' => count($active_theme->getRegions()),
        'regions' => $active_theme->getRegions(),
      ];
    `;
    return await this.runner.evaluate(php);
  }

  /**
   * inspect_template_suggestions: Resolve suggestions for a hook.
   */
  async getTemplateSuggestions(args: { 
    theme_hook: string;
    route_name?: string;
    view_mode?: string;
  }) {
    const php = `
      $theme_hook = '${args.theme_hook}';
      $suggestions = \\Drupal::moduleHandler()->invokeAll('theme_suggestions_' . $theme_hook, [[]]);
      \\Drupal::moduleHandler()->alter('theme_suggestions_' . $theme_hook, $suggestions, []);
      
      // Attempt to find the chosen one if possible via theme manager
      $runtime_suggestions = [];
      try {
        // This is a simplified simulation of suggestion discovery
        $runtime_suggestions = $suggestions;
      } catch (\\Exception $e) {}

      return [
        'theme_hook' => $theme_hook,
        'suggestions' => array_reverse($suggestions),
        'chosen_priority' => 'The last element in suggestions array usually wins in Drupal.',
      ];
    `;
    return await this.runner.evaluate(php);
  }

  /**
   * find_preprocess_chain: List functions affecting a hook.
   */
  async getPreprocessChain(themeHook: string) {
    const php = `
      $theme_hook = '${themeHook}';
      $registry = \\Drupal::service('theme.registry')->get();
      $info = isset($registry[$theme_hook]) ? $registry[$theme_hook] : null;
      
      if (!$info) return ['error' => 'Hook not found in registry'];

      return [
        'theme_hook' => $theme_hook,
        'preprocess_functions' => $info['preprocess functions'] ?? [],
        'template_path' => $info['path'] ?? '',
        'template_name' => $info['template'] ?? '',
        'type' => $info['type'] ?? '',
      ];
    `;
    return await this.runner.evaluate(php);
  }

  /**
   * inspect_render_array: Bounded inspection of a component.
   */
  async getRenderArray(targetType: string, targetId: string, options: any = {}) {
    const maxDepth = options.max_depth || 3;
    const php = `
      $id = '${targetId}';
      $type = '${targetType}';
      $build = [];
      
      if ($type === 'block') {
        $block = \\Drupal\\block\\Entity\\Block::load($id);
        if ($block) {
          $build = \\Drupal::entityTypeManager()->getViewBuilder('block')->view($block);
        }
      } elseif ($type === 'node') {
        $node = \\Drupal\\node\\Entity\\Node::load($id);
        if ($node) {
          $build = \\Drupal::entityTypeManager()->getViewBuilder('node')->view($node, '${options.view_mode || 'full'}');
        }
      }

      // Projection: Remove noisy keys
      $stripNoise = function(&$arr, $depth, $max) use (&$stripNoise) {
        if ($depth > $max) { $arr = '...max depth reached...'; return; }
        if (!is_array($arr)) return;
        
        unset($arr['#cache']);
        unset($arr['#attached']);
        
        foreach ($arr as $key => &$val) {
          if (is_array($val)) {
             $stripNoise($val, $depth + 1, $max);
          }
        }
      };

      $summary = [
        'theme_hook' => $build['#theme'] ?? ($build['#type'] ?? 'unknown'),
        'keys' => array_keys($build),
      ];
      
      $stripNoise($build, 0, ${maxDepth});

      return [
        'summary' => $summary,
        'render_array_preview' => $build,
      ];
    `;
    return await this.runner.evaluate(php);
  }

  /**
   * inspect_sdc_components: Summarize SDC components.
   */
  async getSdcComponents(componentId?: string) {
    const php = `
      if (!\\Drupal::hasService('plugin.manager.sdc')) {
        return ['error' => 'SDC module not enabled or supported in this version.'];
      }
      $manager = \\Drupal::service('plugin.manager.sdc');
      $definitions = $manager->getDefinitions();
      
      if ('${componentId || ''}') {
        $id = '${componentId}';
        return isset($definitions[$id]) ? $definitions[$id] : ['error' => 'Component not found'];
      }

      $summary = [];
      foreach ($definitions as $id => $def) {
        $summary[] = [
          'id' => $id,
          'extension' => $def['provider'],
          'path' => $def['path'],
          'has_schema' => isset($def['props']),
        ];
      }
      return $summary;
    `;
    return await this.runner.evaluate(php);
  }

  /**
   * inspect_library_attachments: CSS/JS mapping.
   */
  async getLibraryAttachments(targetType: string, targetId: string) {
    // Similar to render array but focus on attached
    const php = `
      $id = '${targetId}';
      $type = '${targetType}';
      $build = [];
      if ($type === 'block') {
         $entity = \\Drupal\\block\\Entity\\Block::load($id);
         if ($entity) $build = \\Drupal::entityTypeManager()->getViewBuilder('block')->view($entity);
      } elseif ($type === 'node') {
         $entity = \\Drupal\\node\\Entity\\Node::load($id);
         if ($entity) $build = \\Drupal::entityTypeManager()->getViewBuilder('node')->view($entity);
      }
      
      return [
        'libraries' => $build['#attached']['library'] ?? [],
        'drupalSettings_keys' => isset($build['#attached']['drupalSettings']) ? array_keys($build['#attached']['drupalSettings']) : [],
      ];
    `;
    return await this.runner.evaluate(php);
  }

  /**
   * inspect_blocks_and_regions: Placement summary.
   */
  async getBlocksAndRegions(region?: string) {
    const php = `
      $theme = \\Drupal::config('system.theme')->get('default');
      $blocks = \\Drupal::entityTypeManager()->getStorage('block')->loadByProperties(['theme' => $theme]);
      $data = [];
      foreach ($blocks as $block) {
        if ('${region || ''}' && $block->getRegion() !== '${region}') continue;
        $data[] = [
          'id' => $block->id(),
          'label' => $block->label(),
          'region' => $block->getRegion(),
          'plugin_id' => $block->getPluginId(),
          'weight' => $block->getWeight(),
          'status' => $block->status(),
        ];
      }
      return $data;
    `;
    return await this.runner.evaluate(php);
  }
}
