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
  description: 'List custom modules (modules/custom/). Returns machine_name, path, package. Use before module-scoped searches.',
  inputSchema: {
    query: z.string().optional().describe('Filter by machine_name or label substring (case-insensitive).'),
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
  description: 'Find hook_N implementations. Returns file, line, module. Use when you know the hook suffix.',
  inputSchema: {
    hook_name: z.string().describe('Hook suffix without hook_ prefix. Examples: node_insert, form_alter.'),
    module: z.string().optional().describe('Module machine_name. Omit to search all custom modules.'),
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
  description: 'Search *.services.yml. Returns service_id, class, YAML path, tags. Use to resolve container services to code.',
  inputSchema: {
    service_id: z.string().optional().describe('Exact service ID. Example: entity_type.manager.'),
    class_name: z.string().optional().describe('Substring of PHP class FQCN. Example: NodeStorage.'),
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
  description: 'List EventSubscriber classes. Returns class, file_path. Use to trace event handlers in code.',
  inputSchema: {
    event_name: z.string().optional().describe('Event class or name substring. Omit to list all subscribers.'),
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
  description: 'Find @Plugin annotated classes. Returns class, file_path, module. Use for blocks, fields, filters, etc.',
  inputSchema: {
    plugin_type: z.string().optional().describe('Plugin type fragment. Examples: Block, FieldWidget, migrate.source.'),
    plugin_id: z.string().optional().describe('Plugin ID literal from annotation (id: "my_block").'),
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
  description: 'Locate FormBase/ConfigFormBase class file and routes referencing it.',
  inputSchema: {
    class_name: z.string().describe('Exact PHP short class name (not FQCN). Example: NodeTypeForm.'),
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
  description: 'Map routing.yml entries to controller class, method, PHP file. Use for URL-to-code tracing.',
  inputSchema: {
    route_name: z.string().optional().describe('Exact route name. Example: entity.node.canonical.'),
    path: z.string().optional().describe('URL path substring. Example: /admin/config.'),
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
  description: 'Find theme_preprocess_* functions. Returns function_name, file, line, owner.',
  inputSchema: {
    hook: z.string().optional().describe('Base hook substring in function name. Examples: node, page, field.'),
    theme: z.string().optional().describe('Theme machine_name prefix. Examples: olivero, claro.'),
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
  description: 'Find Drush command provider classes. Returns class, file_path.',
  inputSchema: {
    command_name: z.string().optional().describe('Drush command name/alias substring. Omit to list all providers.'),
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
  description: 'Resolve runtime symbol to ranked code locations. Prefer domain-specific tools when type is certain.',
  inputSchema: {
    domain: z.enum(['route', 'service', 'hook', 'preprocess', 'plugin', 'form_class', 'entity_bundle']).describe('Symbol kind. route=route name, service=service ID, hook=hook suffix, plugin=plugin ID, form_class=short class name.'),
    identifier: z.string().describe('Primary symbol. Examples: entity.node.canonical, entity_type.manager, form_alter, my_block.'),
    secondary_identifier: z.string().optional().describe('plugin: plugin_type. preprocess: theme machine_name.'),
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
