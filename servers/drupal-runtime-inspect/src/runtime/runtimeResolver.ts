import { DrushRunner } from './drushRunner.js';

export interface RuntimeFilterArgs {
  query?: string;
  fields?: string[];
  limit?: number;
  offset?: number;
}

export class RuntimeResolver {
  private runner: DrushRunner;

  constructor(rootDir: string) {
    this.runner = new DrushRunner(rootDir);
  }

  async inspectEntityTypes(args: RuntimeFilterArgs = {}) {
    const query = (args.query || '').replace(/'/g, "\\'");
    const fieldsJson = JSON.stringify(args.fields || []);
    const limit = args.limit || 100;
    const offset = args.offset || 0;
    
    const php = `
      $definitions = \\Drupal::entityTypeManager()->getDefinitions();
      $query = '${query}';
      $fields = json_decode('${fieldsJson.replace(/'/g, "\\'")}');
      
      $results = [];
      foreach ($definitions as $id => $type) {
        $label = (string) $type->getLabel();
        if ($query && strpos($id, $query) === false && strpos(strtolower($label), strtolower($query)) === false) {
          continue;
        }
        
        $data = [
          'entity_type_id' => $id,
          'label' => $label,
          'provider' => $type->getProvider(),
          'class' => $type->getClass(),
          'handlers' => ['storage' => $type->getStorageClass()],
        ];
        
        if (!empty($fields)) {
          $data = array_intersect_key($data, array_flip($fields));
        }
        $results[] = $data;
      }
      $total = count($results);
      $items = array_slice($results, ${offset}, ${limit});
      return ['items' => $items, 'total' => $total, 'has_more' => ($total > ${offset} + ${limit})];
    `;
    return await this.runner.evaluate(php);
  }

  async inspectBundles(entityTypeId: string) {
    const escapedTypeId = entityTypeId.replace(/'/g, "\\'");
    const php = `
      $info = \\Drupal::service('entity_type.bundle.info')->getBundleInfo('${escapedTypeId}');
      $results = [];
      foreach ($info as $bundle => $data) {
        $results[] = ['bundle' => $bundle, 'label' => (string)$data['label']];
      }
      return ['items' => array_values($results)];
    `;
    return await this.runner.evaluate(php);
  }

  async inspectFields(entityTypeId: string, bundle?: string) {
    const escapedTypeId = entityTypeId.replace(/'/g, "\\'");
    const escapedBundle = (bundle || '').replace(/'/g, "\\'");
    const php = `
      $entity_type = '${escapedTypeId}';
      $bundle = '${escapedBundle}';
      $manager = \\Drupal::service('entity_field.manager');
      $definitions = $bundle ? $manager->getFieldDefinitions($entity_type, $bundle) : $manager->getBaseFieldDefinitions($entity_type);
      $results = [];
      foreach ($definitions as $name => $f) {
        $results[] = [
          'field_name' => $name, 
          'field_type' => $f->getType(), 
          'label' => (string)$f->getLabel(),
          'required' => $f->isRequired(),
          'translatable' => $f->isTranslatable(),
          'provider' => method_exists($f, 'getProvider') ? $f->getProvider() : null,
        ];
      }
      return ['items' => array_values($results), 'total' => count($results)];
    `;
    return await this.runner.evaluate(php);
  }

  async inspectRoutes(args: RuntimeFilterArgs = {}) {
    const limit = args.limit || 50;
    const offset = args.offset || 0;
    const query = args.query || '';
    
    const php = `
      $query = '${query}';
      $results = [];
      
      // If query looks like a path, try direct match.
      if ($query && $query[0] === '/') {
        try {
          // Use 'router.no_access_checks' if available.
          $router = \\Drupal::hasService('router.no_access_checks') 
            ? \\Drupal::service('router.no_access_checks') 
            : \\Drupal::service('router.route_provider');
          
          $match = null;
          if (method_exists($router, 'match')) {
             $match = $router->match($query);
          } elseif (method_exists($router, 'getRouteCollectionForRequest')) {
             $request = \\Symfony\\Component\\HttpFoundation\\Request::create($query);
             $collection = $router->getRouteCollectionForRequest($request);
             $match = $collection->getIterator()->current() ? ['_route' => $collection->getIterator()->key(), '_route_object' => $collection->getIterator()->current()] : null;
          }
          
          if ($match && isset($match['_route'])) {
            $routeName = $match['_route'];
            $routeObj = $match['_route_object'] ?? \\Drupal::service('router.route_provider')->getRouteByName($routeName);
            $results[] = [
              'route_name' => $routeName,
              'path' => $routeObj->getPath(),
              'controller' => $routeObj->getDefault('_controller') ?? $routeObj->getDefault('_form') ?? 'unknown',
              'requirements' => $routeObj->getRequirements(),
            ];
          }
        } catch (\\Exception $e) {
          // Fallback to search
        }
      }
      
      if (empty($results)) {
        $routes = \\Drupal::service('router.route_provider')->getAllRoutes();
        foreach ($routes as $name => $route) {
          if ($query && strpos($name, $query) === false && strpos($route->getPath(), $query) === false) continue;
          $results[] = [
            'route_name' => $name, 
            'path' => $route->getPath(),
            'controller' => $route->getDefault('_controller') ?? $route->getDefault('_form') ?? 'unknown',
            'requirements' => $route->getRequirements(),
          ];
          if (count($results) > 500) break;
        }
      }
      
      $total = count($results);
      $items = array_slice($results, ${offset}, ${limit});
      return ['items' => $items, 'total' => $total, 'has_more' => ($total > ${offset} + ${limit})];
    `;
    return await this.runner.evaluate(php);
  }

  async inspectModules(args: RuntimeFilterArgs = {}) {
    const limit = args.limit || 100;
    const offset = args.offset || 0;
    const query = (args.query || '').replace(/'/g, "\\'");
    const php = `
      $active_modules = \\Drupal::moduleHandler()->getModuleList();
      $results = [];
      $query = '${query}';
      foreach ($active_modules as $name => $ext) {
        $info = \\Drupal::service('extension.list.module')->getExtensionInfo($name);
        if ($query && strpos($name, $query) === false && strpos(strtolower($info['name']), strtolower($query)) === false) continue;
        $results[] = ['machine_name' => $name, 'name' => (string)$info['name'], 'version' => $info['version'] ?? 'unknown'];
      }
      $total = count($results);
      $items = array_slice($results, ${offset}, ${limit});
      return ['items' => $items, 'total' => $total, 'has_more' => ($total > ${offset} + ${limit})];
    `;
    return await this.runner.evaluate(php);
  }

  async inspectThemes() {
    const php = `
      $handler = \\Drupal::service('theme_handler');
      $active = \\Drupal::theme()->getActiveTheme()->getName();
      $results = [];
      foreach ($handler->listInfo() as $name => $info) {
        $results[] = ['machine_name' => $name, 'name' => (string)$info->info['name'], 'is_default' => $name === $active];
      }
      return ['items' => array_values($results)];
    `;
    return await this.runner.evaluate(php);
  }

  async inspectServices(args: RuntimeFilterArgs = {}) {
    const limit = args.limit || 100;
    const offset = args.offset || 0;
    const query = args.query || '';
    
    const php = `
      $container = \\Drupal::getContainer();
      $query = '${query}';
      
      if ($query && $container->has($query)) {
        $ids = [$query];
      } else {
        $ids = $container->getServiceIds();
        if ($query) {
          $ids = array_filter($ids, function($id) use ($query) { 
            return strpos($id, $query) !== false; 
          });
        }
      }
      
      $results = [];
      foreach (array_values($ids) as $id) {
         $class = 'unknown';
         if ($container->has($id)) {
            try {
              $class = get_class($container->get($id));
            } catch (\\Exception $e) {}
         }
         $results[] = ['id' => $id, 'class' => $class];
      }
      
      $total = count($results);
      $items = array_slice($results, ${offset}, ${limit});
      return ['items' => $items, 'total' => $total, 'has_more' => ($total > ${offset} + ${limit})];
    `;
    return await this.runner.evaluate(php);
  }

  async inspectPermissions(query?: string) {
    const escapedQuery = (query || '').replace(/'/g, "\\'");
    const php = `
      $all = \\Drupal::service('user.permissions')->getPermissions();
      $results = [];
      $query = '${escapedQuery}';
      foreach ($all as $name => $info) {
        if ($query && strpos($name, $query) === false) continue;
        $results[] = ['permission' => $name, 'title' => (string)$info['title']];
      }
      return ['items' => array_values($results)];
    `;
    return await this.runner.evaluate(php);
  }

  async inspectMenus() {
    const php = `
      $menus = \\Drupal::entityTypeManager()->getStorage('menu')->loadMultiple();
      $results = [];
      foreach ($menus as $id => $menu) {
        $results[] = ['id' => $id, 'label' => (string)$menu->label()];
      }
      return ['items' => array_values($results)];
    `;
    return await this.runner.evaluate(php);
  }

  async inspectVocabularies() {
    const php = `
      $v = \\Drupal::entityTypeManager()->getStorage('taxonomy_vocabulary')->loadMultiple();
      $results = [];
      foreach ($v as $id => $voc) {
        $results[] = ['vid' => $id, 'name' => (string)$voc->label()];
      }
      return ['items' => array_values($results)];
    `;
    return await this.runner.evaluate(php);
  }

  async inspectPlugins(query?: string) {
    const escapedQuery = (query || '').replace(/'/g, "\\'");
    const php = `
      $query = '${escapedQuery}';
      $managers = [
        'block' => \\Drupal::service('plugin.manager.block'),
        'filter' => \\Drupal::service('plugin.manager.filter'),
        'condition' => \\Drupal::service('plugin.manager.condition'),
        'queue' => \\Drupal::service('plugin.manager.queue.worker'),
      ];
      $results = [];
      foreach ($managers as $type => $manager) {
        $all = $manager->getDefinitions();
        foreach ($all as $id => $def) {
          if ($query && strpos($id, $query) === false) continue;
          $results[] = [
            'plugin_type' => $type,
            'plugin_id' => $id,
            'label' => (string)($def['admin_label'] ?? $id),
            'class' => $def['class'] ?? 'unknown',
          ];
        }
      }
      return ['items' => $results];
    `;
    return await this.runner.evaluate(php);
  }

  async searchRuntimeObjects(query: string) {
    const escapedQuery = query.replace(/'/g, "\\'");
    const php = `
      $query = '${escapedQuery}';
      $results = [
        'entity_types' => [],
        'modules' => [],
        'routes' => [],
      ];
      
      // Search entity types
      $definitions = \\Drupal::entityTypeManager()->getDefinitions();
      foreach ($definitions as $id => $type) {
        if (strpos($id, $query) !== false) {
           $results['entity_types'][] = ['id' => $id, 'label' => (string)$type->getLabel()];
        }
        if (count($results['entity_types']) > 5) break;
      }
      
      // Search modules
      $modules = \\Drupal::moduleHandler()->getModuleList();
      foreach ($modules as $name => $ext) {
        if (strpos($name, $query) !== false) {
           $results['modules'][] = $name;
        }
        if (count($results['modules']) > 5) break;
      }
      
      return $results;
    `;
    return await this.runner.evaluate(php);
  }
}
