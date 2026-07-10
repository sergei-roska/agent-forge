import { z } from 'zod';
import { buildEnvelope, type ToolDefinition, SharedArgsSchema } from '@agent-forge/mcp-core';
import { PhpScanner } from '../repo/phpSymbols.js';
import { YamlScanner } from '../repo/yamlFiles.js';
import { YamlServices } from '../repo/yamlServices.js';
import { YamlRoutes } from '../repo/routes.js';
import { ModuleRepository } from '../repo/modules.js';
import { HookResolver } from '../resolvers/hooks.js';
import { ServiceResolver } from '../resolvers/services.js';
import { EventResolver } from '../resolvers/events.js';
import { PluginResolver } from '../resolvers/plugins.js';
import { FormResolver } from '../resolvers/forms.js';
import { ControllerResolver } from '../resolvers/controllers.js';
import { PreprocessResolver } from '../resolvers/preprocess.js';
import { DrushResolver } from '../resolvers/drush.js';
import { RuntimeTraceResolver } from '../resolvers/runtimeTrace.js';

// Cache instances to maintain fast lookups across requests in the same session
let phpScanner: PhpScanner;
let yamlScanner: YamlScanner;

function getInstances(rootDir: string) {
  if (!phpScanner) phpScanner = new PhpScanner(rootDir);
  if (!yamlScanner) yamlScanner = new YamlScanner(rootDir);
  
  const yamlServices = new YamlServices(yamlScanner);
  const yamlRoutes = new YamlRoutes(yamlScanner);
  const modules = new ModuleRepository(yamlScanner);
  
  const hooks = new HookResolver(phpScanner);
  const services = new ServiceResolver(yamlServices);
  const events = new EventResolver(phpScanner);
  const plugins = new PluginResolver(phpScanner);
  const forms = new FormResolver(phpScanner, yamlRoutes);
  const controllers = new ControllerResolver(phpScanner, yamlRoutes);
  const preprocess = new PreprocessResolver(phpScanner);
  const drush = new DrushResolver(phpScanner);
  const runtimeTrace = new RuntimeTraceResolver(controllers, services, hooks, preprocess, plugins, forms, events);

  return { modules, hooks, services, events, plugins, forms, controllers, preprocess, drush, runtimeTrace };
}

export const listCustomModulesTool = (rootDir: string): ToolDefinition => ({
  name: 'list_custom_modules',
  description: 'List custom modules (modules/custom/). Returns machine_name, name, description, path, package. Use before module-scoped searches.',
  inputSchema: {
    query: z.string().optional().describe('Filter by machine_name or name substring (case-insensitive).'),
  } as any,
  handler: async (args) => {
    try {
      const { modules } = getInstances(rootDir);
      const data = await modules.listCustomModules(args.query as string);
      return buildEnvelope({
        summary: `Found ${data.length} custom modules.`,
        data,
        source: 'codebase',
      });
    } catch (e: any) {
      return buildEnvelope({ summary: `Error: ${e.message}`, data: [], source: 'codebase' });
    }
  },
});

export const findHookImplementationsTool = (rootDir: string): ToolDefinition => ({
  name: 'find_hook_implementations',
  description: 'Find hook_N implementations via static PHP scan. Returns symbol (full function name), file_path, line, module, confidence. Use when you know the hook suffix.',
  inputSchema: {
    hook_name: z.string().describe('Hook suffix without hook_ prefix. Examples: node_insert, form_alter.'),
    module: z.string().optional().describe('Exact module machine_name to restrict results. Omit to search all custom modules.'),
    limit: z.number().optional().describe('Max results. Integer ≥1.'),
  } as any,
  handler: async (args) => {
    try {
      const { hooks } = getInstances(rootDir);
      const data = await hooks.findImplementations(args.hook_name as string, args.module as string, args.limit as number);
      return buildEnvelope({
        summary: `Found ${data.length} implementations for hook_${args.hook_name}.`,
        data,
        source: 'codebase',
      });
    } catch (e: any) {
      return buildEnvelope({ summary: `Error: ${e.message}`, data: [], source: 'codebase' });
    }
  },
});

export const findServiceDefinitionsTool = (rootDir: string): ToolDefinition => ({
  name: 'find_service_definitions',
  description: 'Search *.services.yml. Returns service_id, class (FQCN), file_path (path to the .services.yml file, not the PHP class), tags, module, confidence. Use to resolve container services to code.',
  inputSchema: {
    service_id: z.string().optional().describe('Exact service ID (equality match). Example: entity_type.manager.'),
    class_name: z.string().optional().describe('Substring of PHP class FQCN (case-sensitive). Example: NodeStorage.'),
  } as any,
  handler: async (args) => {
    try {
      const { services } = getInstances(rootDir);
      const data = await services.findDefinitions(args.service_id as string, args.class_name as string);
      return buildEnvelope({
        summary: `Found ${data.length} service definitions.`,
        data,
        source: 'codebase',
      });
    } catch (e: any) {
      return buildEnvelope({ summary: `Error: ${e.message}`, data: [], source: 'codebase' });
    }
  },
});

export const findEventSubscribersTool = (rootDir: string): ToolDefinition => ({
  name: 'find_event_subscribers',
  description: 'List EventSubscriber classes via static PHP scan. Returns class, file_path, module, confidence, events (always ["unknown (static analysis limitation)"] — exact event extraction requires runtime). event_name filters by raw file content substring.',
  inputSchema: {
    event_name: z.string().optional().describe('Raw substring to search inside the subscriber file content (event class name or string literal). Omit to list all subscribers.'),
  } as any,
  handler: async (args) => {
    try {
      const { events } = getInstances(rootDir);
      const data = await events.findSubscribers(args.event_name as string);
      return buildEnvelope({
        summary: `Found ${data.length} event subscribers.`,
        data,
        source: 'codebase',
      });
    } catch (e: any) {
      return buildEnvelope({ summary: `Error: ${e.message}`, data: [], source: 'codebase' });
    }
  },
});

export const findPluginClassesTool = (rootDir: string): ToolDefinition => ({
  name: 'find_plugin_classes',
  description: 'Find @Plugin annotated classes via static PHP scan. Returns plugin_type (internal symbol name), plugin_id (from arg or "extracted-via-static" when omitted), class (short name from filename), file_path, module, confidence. plugin_type matches against the symbol name heuristically; plugin_id searches raw file content for quoted string.',
  inputSchema: {
    plugin_type: z.string().optional().describe('Fragment matched against the internal plugin symbol name. Examples: Block, FieldWidget, migrate.source.'),
    plugin_id: z.string().optional().describe('Plugin ID string to search for inside file content (heuristic). Example: my_block.'),
  } as any,
  handler: async (args) => {
    try {
      const { plugins } = getInstances(rootDir);
      const data = await plugins.findClasses(args.plugin_type as string, args.plugin_id as string);
      return buildEnvelope({
        summary: `Found ${data.length} plugin classes.`,
        data,
        source: 'codebase',
      });
    } catch (e: any) {
      return buildEnvelope({ summary: `Error: ${e.message}`, data: [], source: 'codebase' });
    }
  },
});

export const findFormClassesTool = (rootDir: string): ToolDefinition => ({
  name: 'find_form_classes',
  description: 'Locate form classes (FormBase/ConfigFormBase) via static PHP scan and routes referencing them. Returns class, form_base (always "FormBase (Static Assumption)"), file_path, route_names, confidence. Omit class_name to list all detected form classes.',
  inputSchema: {
    class_name: z.string().optional().describe('Exact PHP short class name (not FQCN, equality match). Omit to list all form classes. Example: NodeTypeForm.'),
  } as any,
  handler: async (args) => {
    try {
      const { forms } = getInstances(rootDir);
      const data = await forms.findClasses(args.class_name as string);
      return buildEnvelope({
        summary: `Located ${data.length} form classes matching ${args.class_name}.`,
        data,
        source: 'codebase',
      });
    } catch (e: any) {
      return buildEnvelope({ summary: `Error: ${e.message}`, data: [], source: 'codebase' });
    }
  },
});

export const findControllerHandlersTool = (rootDir: string): ToolDefinition => ({
  name: 'find_controller_handlers',
  description: 'Map *.routing.yml entries to controller class, method, PHP file_path, confidence. method falls back to "__invoke" when not specified in routing.yml. file_path is "unknown (static lookup failed)" when the controller class cannot be matched via PHP scan.',
  inputSchema: {
    route_name: z.string().optional().describe('Exact route name (equality match). Example: entity.node.canonical.'),
    path: z.string().optional().describe('URL path substring (case-sensitive). Example: /admin/config.'),
  } as any,
  handler: async (args) => {
    try {
      const { controllers } = getInstances(rootDir);
      const data = await controllers.findHandlers(args.route_name as string, args.path as string);
      return buildEnvelope({
        summary: `Located ${data.length} route-to-controller mappings.`,
        data,
        source: 'codebase',
      });
    } catch (e: any) {
      return buildEnvelope({ summary: `Error: ${e.message}`, data: [], source: 'codebase' });
    }
  },
});

export const findPreprocessFunctionsTool = (rootDir: string): ToolDefinition => ({
  name: 'find_preprocess_functions',
  description: 'Find OWNER_preprocess_HOOK functions (from both modules and themes). Returns function_name, file_path, line, owner (prefix before "_preprocess_"), confidence.',
  inputSchema: {
    hook: z.string().optional().describe('Substring matched anywhere in the full function name. Examples: node, page, field.'),
    theme: z.string().optional().describe('Owner name prefix (module or theme machine_name). Matches functions whose name starts with "<theme>_". Examples: olivero, my_module.'),
  } as any,
  handler: async (args) => {
    try {
      const { preprocess } = getInstances(rootDir);
      const data = await preprocess.findFunctions(args.hook as string, args.theme as string);
      return buildEnvelope({
        summary: `Found ${data.length} matching preprocess functions.`,
        data,
        source: 'codebase',
      });
    } catch (e: any) {
      return buildEnvelope({ summary: `Error: ${e.message}`, data: [], source: 'codebase' });
    }
  },
});

export const findDrushCommandsTool = (rootDir: string): ToolDefinition => ({
  name: 'find_drush_commands',
  description: 'Find Drush command provider classes via static PHP scan. Returns command_name (echoes arg, or "unknown (static analysis limitation)" when omitted), class, file_path, confidence (always 0.7 — heuristic only). command_name filters by raw content substring or class name substring.',
  inputSchema: {
    command_name: z.string().optional().describe('Substring to search inside class file content or class name (heuristic). Omit to list all Drush command provider classes.'),
  } as any,
  handler: async (args) => {
    try {
      const { drush } = getInstances(rootDir);
      const data = await drush.findCommands(args.command_name as string);
      return buildEnvelope({
        summary: `Found ${data.length} drush command providers.`,
        data,
        source: 'codebase',
      });
    } catch (e: any) {
      return buildEnvelope({ summary: `Error: ${e.message}`, data: [], source: 'codebase' });
    }
  },
});

export const traceRuntimeToCodeTool = (rootDir: string): ToolDefinition => ({
  name: 'trace_runtime_to_code',
  description: 'Resolve a runtime symbol to ranked code locations. Delegates to domain-specific resolvers. Prefer domain-specific tools when symbol type is certain.',
  inputSchema: {
    domain: z.enum(['route', 'service', 'hook', 'preprocess', 'plugin', 'form_class']).describe(
      'Symbol kind: ' +
      'route = exact route name (→ find_controller_handlers); ' +
      'service = exact service ID (→ find_service_definitions); ' +
      'hook = hook suffix without hook_ prefix (→ find_hook_implementations); ' +
      'preprocess = hook substring (→ find_preprocess_functions); ' +
      'plugin = plugin_id string, secondary_identifier = plugin_type fragment (→ find_plugin_classes); ' +
      'form_class = exact short class name (→ find_form_classes).'
    ),
    identifier: z.string().describe('Primary symbol value. Examples: entity.node.canonical (route), entity_type.manager (service), node_insert (hook), my_block (plugin), NodeTypeForm (form_class).'),
    secondary_identifier: z.string().optional().describe('plugin domain: plugin_type fragment. preprocess domain: owner/theme name prefix (passed as themeName filter).'),
    limit: z.number().default(5).describe('Max ranked results. Integer, default 5.'),
  } as any,
  handler: async (args) => {
    try {
      const { runtimeTrace } = getInstances(rootDir);
      const data = await runtimeTrace.trace(args.domain as string, args.identifier as string, args.secondary_identifier as string, args.limit as number);
      return buildEnvelope({
        summary: `Resolved ${args.domain}: [${args.identifier}] to ${data.length} ranked locations.`,
        data,
        source: 'codebase',
      });
    } catch (e: any) {
      return buildEnvelope({ summary: `Error: ${e.message}`, data: [], source: 'codebase' });
    }
  },
});

export const summarizeCodeInventoryTool = (rootDir: string): ToolDefinition => ({
  name: 'summarize_code_inventory',
  description: 'Return custom module count/names plus service and route totals. Use for initial codebase orientation.',
  inputSchema: {} as any,
  handler: async (args) => {
    try {
      const { modules, services, controllers } = getInstances(rootDir);
      const customMods = await modules.listCustomModules();
      const allServices = await services.findDefinitions();
      const allRoutes = await controllers.findHandlers();

      const data = {
        custom_modules: customMods.length,
        custom_list: customMods.map(m => m.machine_name),
        total_services_found: allServices.length,
        total_routes_found: allRoutes.length,
        drupal_version: 'Unknown (Static Analysis)',
        method: 'filesystem_fallback'
      };

      return buildEnvelope({
        summary: `Codebase Inventory: ${data.custom_modules} custom modules detected.`,
        data: [data],
        source: 'codebase',
      });
    } catch (e: any) {
      return buildEnvelope({ summary: `Error: ${e.message}`, data: [], source: 'codebase' });
    }
  },
});
