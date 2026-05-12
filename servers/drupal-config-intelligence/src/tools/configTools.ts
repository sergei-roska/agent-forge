import { z } from 'zod';
import { buildEnvelope, type ToolDefinition, SharedArgsSchema } from '@agent-forge/mcp-core';
import { DrushRunner } from '../runtime/drushRunner.js';
import { ActiveStorage } from '../config/activeStorage.js';
import { SyncStorage } from '../config/syncStorage.js';
import { ConfigSplitState } from '../config/splitState.js';
import { RecipeStorage } from '../config/recipes.js';
import { ConfigDiff } from '../analysis/diff.js';
import { ConfigDependencies } from '../analysis/dependencies.js';
import { ConfigOwnership } from '../analysis/ownership.js';
import { ConfigImpact } from '../analysis/impact.js';
import { ConfigDrift } from '../analysis/drift.js';
import { DeploymentRisk } from '../analysis/risk.js';

export const inspectConfigObjectTool = (rootDir: string): ToolDefinition => ({
  name: 'inspect_config_object',
  description: 'Read one config object from active or sync storage with compact projection.',
  inputSchema: {
    config_name: z.string().describe('Full config name (e.g. system.site, node.type.article).'),
    source: z.enum(['active', 'sync', 'both']).default('active'),
    include_overrides: z.boolean().default(true).describe('Include configuration overrides from settings.php (Active only).'),
  } as any,
  handler: async (args) => {
    try {
      const runner = new DrushRunner(rootDir);
      const active = new ActiveStorage(runner);
      const sync = new SyncStorage(rootDir);
      
      const results: any = { config_name: args.config_name };
      let warning: string | undefined;

      if (args.source === 'active' || args.source === 'both') {
        try {
          const data = await active.read(args.config_name as string, args.include_overrides as boolean);
          results.active = data;
        } catch (e: any) {
          warning = `Active storage unavailable: ${e.message}`;
          results.active = null;
        }
      }
      if (args.source === 'sync' || args.source === 'both') {
        const data = await sync.read(args.config_name as string);
        results.sync = data;
      }

      return buildEnvelope({
        summary: `Inspected ${args.config_name} from ${args.source}. ${warning ? ' (Warning: ' + warning + ')' : ''}`,
        data: [results],
        source: 'mixed',
      });
    } catch (error: any) {
      return buildEnvelope({
        summary: `Error inspecting ${args.config_name}: ${error.message}`,
        data: [{ config_name: args.config_name, error: error.message }],
        source: 'mixed',
      });
    }
  },
});

export const diffActiveVsSyncTool = (rootDir: string): ToolDefinition => ({
  name: 'diff_active_vs_sync',
  description: 'Compare active and sync config for a named object or filtered set.',
  inputSchema: {
    config_name: z.string().describe('Target config name.'),
    include_patch: z.boolean().default(false).describe('Include full patch data.'),
  } as any,
  handler: async (args) => {
    try {
      const runner = new DrushRunner(rootDir);
      const diff = new ConfigDiff(new ActiveStorage(runner), new SyncStorage(rootDir));
      const data = await diff.compare(args.config_name as string, args.include_patch as boolean);
      return buildEnvelope({
        summary: `Diff for ${args.config_name}. Status: ${data.status}.`,
        data: [data],
        source: 'mixed',
      });
    } catch (error: any) {
      return buildEnvelope({
        summary: `Error performing diff for ${args.config_name}: ${error.message}`,
        data: [{ name: args.config_name, error: error.message, status: 'unknown' }],
        source: 'mixed',
      });
    }
  },
});

export const traceConfigDependenciesTool = (rootDir: string): ToolDefinition => ({
  name: 'trace_config_dependencies',
  description: 'Explain direct and bounded transitive dependencies for a config object.',
  inputSchema: {
    config_name: z.string().describe('Config name to trace.'),
    max_depth: z.number().default(3).describe('Maximum depth for transitive dependencies.'),
    direction: z.enum(['requires', 'required_by', 'both']).default('both').describe('Trace direction.'),
  } as any,
  handler: async (args) => {
    try {
      const runner = new DrushRunner(rootDir);
      const deps = new ConfigDependencies(runner, new SyncStorage(rootDir));
      const data = await deps.trace(args.config_name as string, args.max_depth as number, args.direction as any);
      return buildEnvelope({
        summary: `Dependency trace for ${args.config_name}.${data.warning ? ' (Warning: ' + data.warning + ')' : ''}`,
        data: [data],
        source: data.method === 'drush' ? 'runtime' : 'config_sync',
      });
    } catch (error: any) {
      return buildEnvelope({
        summary: `Error tracing dependencies for ${args.config_name}: ${error.message}`,
        data: [{ name: args.config_name, error: error.message }],
        source: 'mixed',
      });
    }
  },
});

export const findConfigOwnerTool = (rootDir: string): ToolDefinition => ({
  name: 'find_config_owner',
  description: 'Identify which module or profile provides a config object.',
  inputSchema: {
    config_name: z.string().describe('Full config name to trace ownership for.'),
  } as any,
  handler: async (args) => {
    try {
      const runner = new DrushRunner(rootDir);
      const owner = new ConfigOwnership(runner);
      const data = await owner.findOwner(args.config_name as string);
      return buildEnvelope({
        summary: `Owner detected for ${args.config_name}.`,
        data: [data],
        source: 'codebase',
      });
    } catch (error: any) {
      return buildEnvelope({
        summary: `Error finding owner for ${args.config_name}: ${error.message}`,
        data: [{ name: args.config_name, error: error.message }],
        source: 'mixed',
      });
    }
  },
});

export const detectConfigDriftTool = (rootDir: string): ToolDefinition => ({
  name: 'detect_config_drift',
  description: 'Find mismatches between active storage and sync storage.',
  inputSchema: {
    ...SharedArgsSchema.shape,
    prefix: z.string().optional().describe('Optional prefix to filter.'),
  } as any,
  handler: async (args) => {
    try {
      const runner = new DrushRunner(rootDir);
      const drift = new ConfigDrift(runner, new SyncStorage(rootDir));
      const data = await drift.detect(args.prefix as string);
      return buildEnvelope({
        summary: data.drift_count === null ? `Drift detection unavailable: ${data.warning}` : `Found ${data.drift_count} drifting config objects.`,
        data: data.items,
        source: 'mixed',
      });
    } catch (error: any) {
      return buildEnvelope({
        summary: `Error detecting drift: ${error.message}`,
        data: [],
        source: 'mixed',
      });
    }
  },
});

export const analyzeConfigImpactTool = (rootDir: string): ToolDefinition => ({
  name: 'analyze_config_impact',
  description: 'Estimate deployment impact for a config object or diff set.',
  inputSchema: {
    config_name: z.string().describe('Config object to analyze impact for.'),
  } as any,
  handler: async (args) => {
    try {
      const runner = new DrushRunner(rootDir);
      const sync = new SyncStorage(rootDir);
      const active = new ActiveStorage(runner);
      const impact = new ConfigImpact(new ConfigDiff(active, sync), new ConfigDependencies(runner, sync));
      const data = await impact.analyze(args.config_name as string);
      return buildEnvelope({
        summary: `Impact analysis for ${args.config_name}. Risk: ${data.risk_level}.`,
        data: [data],
        source: 'mixed',
      });
    } catch (error: any) {
      return buildEnvelope({
        summary: `Error analyzing impact for ${args.config_name}: ${error.message}`,
        data: [{ target: args.config_name, error: error.message }],
        source: 'mixed',
      });
    }
  },
});

export const inspectConfigSplitStateTool = (rootDir: string): ToolDefinition => ({
  name: 'inspect_config_split_state',
  description: 'Summarize enabled Config Splits and their inclusion patterns.',
  inputSchema: {
    split_name: z.string().optional().describe('Filter by split name.'),
  } as any,
  handler: async (args) => {
    try {
      const runner = new DrushRunner(rootDir);
      const splits = new ConfigSplitState(runner);
      const data = await splits.list(args.split_name as string);
      return buildEnvelope({
        summary: `Found ${data.length} configuration splits.`,
        data: data,
        source: 'runtime',
      });
    } catch (error: any) {
      return buildEnvelope({
        summary: `Error inspecting config splits: ${error.message}`,
        data: [],
        source: 'mixed',
      });
    }
  },
});

export const inspectRecipeStateTool = (rootDir: string): ToolDefinition => ({
  name: 'inspect_recipe_state',
  description: 'Summarize Drupal Recipe states and managed configurations.',
  inputSchema: {
    recipe_name: z.string().optional().describe('Filter by recipe name.'),
  } as any,
  handler: async (args) => {
    try {
      const runner = new DrushRunner(rootDir);
      const recipes = new RecipeStorage(runner);
      const data = await recipes.getRecipeState(args.recipe_name as string);
      return buildEnvelope({
        summary: `Recipe state for ${args.recipe_name || 'all'}.`,
        data: data,
        source: 'mixed',
      });
    } catch (error: any) {
      return buildEnvelope({
        summary: `Error inspecting recipe state: ${error.message}`,
        data: [],
        source: 'mixed',
      });
    }
  },
});

export const summarizeDeploymentRiskTool = (rootDir: string): ToolDefinition => ({
  name: 'summarize_deployment_risk',
  description: 'Produce a high-level narrative risk summary of the current config delta.',
  inputSchema: {} as any,
  handler: async (args) => {
    try {
      const runner = new DrushRunner(rootDir);
      const sync = new SyncStorage(rootDir);
      const risk = new DeploymentRisk(new ConfigDrift(runner, sync), new ConfigSplitState(runner));
      const data = await risk.summarize();
      return buildEnvelope({
        summary: data.summary,
        data: [data],
        source: 'mixed',
      });
    } catch (error: any) {
      return buildEnvelope({
        summary: `Deployment Risk Analysis: FAILED. Error: ${error.message}`,
        data: [{ error: error.message, drift_count: null, blockers: [error.message] }],
        source: 'mixed',
      });
    }
  },
});
