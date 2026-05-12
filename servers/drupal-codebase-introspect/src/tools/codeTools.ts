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
  description: 'List installed custom modules and their paths.',
  inputSchema: {
    query: z.string().optional().describe('Optional name/machine_name filter.'),
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
  description: 'Locate implementations of a specific Drupal hook across all enabled modules.',
  inputSchema: {
    hook_name: z.string().describe('Hook name (e.g. node_insert, form_alter).'),
    module: z.string().optional().describe('Filter by module name.'),
    limit: z.number().optional().describe('Limit the number of results.'),
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
  description: 'Lookup service IDs, classes, and file paths.',
  inputSchema: {
    service_id: z.string().optional().describe('Service ID to find.'),
    class_name: z.string().optional().describe('Class name substring to filter.'),
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
  description: 'Locate Symfony event subscribers for specific events or classes.',
  inputSchema: {
    event_name: z.string().optional().describe('Target event name.'),
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
  description: 'Locate plugin classes by plugin type or plugin ID.',
  inputSchema: {
    plugin_type: z.string().optional().describe('Plugin type (e.g. Block, FieldWidget).'),
    plugin_id: z.string().optional().describe('Specific plugin ID.'),
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
  description: 'Resolve a form class name to its file location.',
  inputSchema: {
    class_name: z.string().describe('Full form class name.'),
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
  description: 'Map route names or paths to their controller classes and methods.',
  inputSchema: {
    route_name: z.string().optional().describe('Specific route name to trace.'),
    path: z.string().optional().describe('Path substring (e.g. /node/) to trace.'),
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
  description: 'Detect preprocess functions for specific themes or hooks.',
  inputSchema: {
    hook: z.string().optional().describe('Base hook (e.g. node, page).'),
    theme: z.string().optional().describe('Theme name (e.g. bartik, olivero).'),
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
  description: 'Locate Drush command definitions and their classes.',
  inputSchema: {
    command_name: z.string().optional().describe('Specific drush command to find.'),
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
  description: 'Resolve a runtime symbol (route, service, hook) back to its code location.',
  inputSchema: {
    domain: z.enum(['route', 'service', 'hook', 'preprocess', 'plugin', 'form_class', 'entity_bundle']).describe('Domain to trace.'),
    identifier: z.string().describe('Symbol to trace (e.g. system.site, node_insert).'),
    secondary_identifier: z.string().optional().describe('Optional secondary filter.'),
    limit: z.number().default(5).describe('Maximum number of ranked results.'),
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
  description: 'Produce a high-level narrative summary of the codebase architecture.',
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
