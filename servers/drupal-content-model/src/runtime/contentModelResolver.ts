import { DrushRunner } from './drushRunner.js';

export interface ContentFilterArgs {
  query?: string;
  limit?: number;
  offset?: number;
  bundle?: string;
}

export class ContentModelResolver {
  private runner: DrushRunner;

  constructor(rootDir: string) {
    this.runner = new DrushRunner(rootDir);
  }

  async inspectContentTypes(args: ContentFilterArgs = {}) {
    const limit = args.limit || 50;
    const offset = args.offset || 0;
    const php = `
      $bundle = '${args.bundle || ''}';
      $info = \\Drupal::service('entity_type.bundle.info')->getBundleInfo('node');
      $results = [];
      foreach ($info as $id => $data) {
        if ($bundle && $bundle !== $id) continue;
        
        $workflow = null;
        if (\\Drupal::moduleHandler()->moduleExists('content_moderation')) {
          $workflows = \\Drupal::entityTypeManager()->getStorage('workflow')->loadMultiple();
          foreach ($workflows as $w) {
            $config = $w->getTypePlugin()->getConfiguration();
            if (isset($config['entity_types']['node']) && in_array($id, $config['entity_types']['node'])) {
              $workflow = $w->id();
              break;
            }
          }
        }

        $results[] = [
          'bundle' => $id,
          'label' => (string)$data['label'],
          'revisionable' => true,
          'workflow' => $workflow,
        ];
      }
      $total = count($results);
      $items = array_slice($results, ${offset}, ${limit});
      return ['items' => $items, 'total' => $total, 'has_more' => ($total > (${offset} + ${limit}))];
    `;
    return await this.runner.evaluate(php);
  }

  async inspectMediaTypes(args: ContentFilterArgs = {}) {
    const limit = args.limit || 50;
    const offset = args.offset || 0;
    const php = `
      $bundle = '${args.bundle || ''}';
      if (!\\Drupal::moduleHandler()->moduleExists('media')) return ['items' => []];
      $types = \\Drupal::entityTypeManager()->getStorage('media_type')->loadMultiple();
      $results = [];
      foreach ($types as $id => $type) {
        if ($bundle && $bundle !== $id) continue;
        $results[] = [
          'bundle' => $id,
          'label' => (string)$type->label(),
          'source_plugin' => $type->getSource()->getPluginId(),
          'translatable' => \\Drupal::moduleHandler()->moduleExists('content_translation') && \\Drupal::service('content_translation.manager')->isEnabled('media', $id),
        ];
      }
      $total = count($results);
      $items = array_slice($results, ${offset}, ${limit});
      return ['items' => $items, 'total' => $total, 'has_more' => ($total > (${offset} + ${limit}))];
    `;
    return await this.runner.evaluate(php);
  }

  async inspectTaxonomyModels(args: ContentFilterArgs = {}) {
    const limit = args.limit || 50;
    const offset = args.offset || 0;
    const php = `
      $vocab = '${args.bundle || ''}';
      if (!\\Drupal::moduleHandler()->moduleExists('taxonomy')) return ['items' => []];
      $storage = \\Drupal::entityTypeManager()->getStorage('taxonomy_vocabulary');
      $items = $vocab ? [$storage->load($vocab)] : $storage->loadMultiple();
      $results = [];
      foreach ($items as $v) {
        if (!$v) continue;
        $results[] = [
          'vocabulary' => $v->id(),
          'label' => (string)$v->label(),
        ];
      }
      $total = count($results);
      $items = array_slice($results, ${offset}, ${limit});
      return ['items' => $items, 'total' => $total, 'has_more' => ($total > (${offset} + ${limit}))];
    `;
    return await this.runner.evaluate(php);
  }

  async inspectFieldUsage(entityTypeId: string, args: ContentFilterArgs = {}) {
    const limit = args.limit || 50;
    const offset = args.offset || 0;
    const php = `
      $entity_type = '${entityTypeId}';
      $bundle_filter = '${args.bundle || ''}';
      $query = strtolower('${args.query || ''}');
      $manager = \\Drupal::service('entity_field.manager');
      
      $results = [];
      if ($bundle_filter) {
        $definitions = $manager->getFieldDefinitions($entity_type, $bundle_filter);
        foreach ($definitions as $name => $f) {
          if ($query && strpos(strtolower($name), $query) === false && strpos(strtolower($f->getLabel()), $query) === false) continue;
          $results[] = [
            'name' => $name,
            'type' => $f->getType(),
            'label' => (string)$f->getLabel(),
            'bundle' => $bundle_filter,
          ];
        }
      } else {
        // Look across all bundles using the field map
        $all_maps = $manager->getFieldMap();
        $field_map = $all_maps[$entity_type] ?? [];
        foreach ($field_map as $field_name => $info) {
          if ($query && strpos(strtolower($field_name), $query) === false) continue;
          
          // Get definition from the first bundle to get the label/type
          $first_bundle = reset($info['bundles']);
          $definitions = $manager->getFieldDefinitions($entity_type, $first_bundle);
          if (!isset($definitions[$field_name])) continue;
          
          $f = $definitions[$field_name];
          if ($query && strpos(strtolower($f->getLabel()), $query) === false && strpos(strtolower($field_name), $query) === false) continue;

          $results[] = [
            'name' => $field_name,
            'type' => $f->getType(),
            'label' => (string)$f->getLabel(),
            'bundles' => array_values($info['bundles']),
          ];
        }
      }
      
      $total = count($results);
      $items = array_slice($results, ${offset}, ${limit});
      return ['items' => $items, 'total' => $total, 'has_more' => ($total > (${offset} + ${limit}))];
    `;
    return await this.runner.evaluate(php);
  }

  async inspectReferenceGraph(entityTypeId: string, bundle?: string) {
    const php = `
      $entity_type = '${entityTypeId}';
      $bundle = '${bundle || ''}';
      $manager = \\Drupal::service('entity_field.manager');
      $results = [];
      $bundles = $bundle ? [$bundle] : array_keys(\\Drupal::service('entity_type.bundle.info')->getBundleInfo($entity_type));
      
      foreach ($bundles as $b) {
        $fields = $manager->getFieldDefinitions($entity_type, $b);
        foreach ($fields as $name => $f) {
          $type = $f->getType();
          if ($type === 'entity_reference' || $type === 'entity_reference_revisions' || $type === 'image' || $type === 'file') {
            $settings = $f->getSettings();
            $target_type = $settings['target_type'] ?? ($type === 'image' || $type === 'file' ? 'file' : 'unknown');
            $target_bundles = $settings['handler_settings']['target_bundles'] ?? null;
            $results[] = [
              'bundle' => $b,
              'field' => $name,
              'type' => $type,
              'target_type' => $target_type,
              'target_bundles' => $target_bundles ? array_values($target_bundles) : 'all',
            ];
          }
        }
      }
      return ['items' => $results];
    `;
    return await this.runner.evaluate(php);
  }

  async inspectDisplayModes(entityTypeId: string, bundle?: string) {
    const php = `
      $entity_type = '${entityTypeId}';
      $bundle = '${bundle || ''}';
      $repo = \\Drupal::service('entity_display.repository');
      // SMART NOISE REDUCTION: Only show enabled display modes
      $view_modes = $repo->getViewModeOptionsByBundle($entity_type, $bundle);
      $form_modes = $repo->getFormModeOptionsByBundle($entity_type, $bundle);
      
      return [
        'view_modes' => array_keys($view_modes),
        'form_modes' => array_keys($form_modes),
      ];
    `;
    return await this.runner.evaluate(php);
  }

  async inspectRevisioning(entityTypeId: string, bundle?: string) {
    const php = `
      $id = '${entityTypeId}';
      $type = \\Drupal::entityTypeManager()->getDefinition($id);
      return [
        'revisionable' => $type->isRevisionable(),
        'revision_ui' => $type->hasHandlerClass('revision'),
      ];
    `;
    return await this.runner.evaluate(php);
  }

  async inspectTranslation(entityTypeId: string, bundle?: string) {
    const php = `
      $manager = \\Drupal::service('content_translation.manager');
      $id = '${entityTypeId}';
      $b = '${bundle || ''}';
      return [
        'translatable' => $manager->isEnabled($id, $b),
      ];
    `;
    return await this.runner.evaluate(php);
  }

  async inspectModeration(entityTypeId: string, bundle?: string) {
    const php = `
      if (!\\Drupal::moduleHandler()->moduleExists('content_moderation')) return ['moderated' => false];
      $id = '${entityTypeId}';
      $b = '${bundle || ''}';
      
      $workflows = \\Drupal::entityTypeManager()->getStorage('workflow')->loadMultiple();
      foreach ($workflows as $w) {
        $config = $w->getTypePlugin()->getConfiguration();
        if (isset($config['entity_types'][$id]) && in_array($b, $config['entity_types'][$id])) {
          return [
            'moderated' => true,
            'workflow' => $w->id(),
            'states' => array_keys($config['states'] ?? []), // Standardized states list
          ];
        }
      }
      return ['moderated' => false];
    `;
    return await this.runner.evaluate(php);
  }

  async summarizeEditorialModel(entityTypeId: string, bundle?: string) {
    // Composition of cleaned tools
    const content = await this.inspectContentTypes({ bundle });
    const graph = await this.inspectReferenceGraph(entityTypeId, bundle);
    
    // Safety check for moderation lookup
    const targetBundle = bundle || content.items[0]?.bundle;
    const mod = targetBundle ? await this.inspectModeration(entityTypeId, targetBundle) : { moderated: false };
    
    return {
      domain: entityTypeId,
      bundle: bundle || 'all',
      // SMART NOISE REDUCTION: Summary only includes IDs and labels, not full field dumps
      bundles_count: content.items.length,
      reference_edges: graph.items.length,
      moderation: mod,
      top_references: graph.items.slice(0, 10), // Limit graph visibility in summary
    };
  }
}
