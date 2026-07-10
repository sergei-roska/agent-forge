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
  description: 'Read one Drupal config as JSON. Returns active DB and/or sync YAML values. Use to inspect a single machine name.',
  inputSchema: {
    config_name: z.string().describe('Config machine name. Examples: system.site, node.type.article.'),
    source: z.enum(['active', 'sync', 'both']).default('active')
      .describe('active=DB, sync=config/sync export, both=compare side-by-side.'),
    include_overrides: z.boolean().default(true)
      .describe('Merge settings.php overrides into active. Active source only.'),
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
  description: 'Diff one config: active DB vs sync export. Returns status, changed keys, risk_level. Use before cim/cex.',
  inputSchema: {
    config_name: z.string().describe('Config machine name to diff.'),
    include_patch: z.boolean().default(false)
      .describe('Include full JSON patch. Default false (changed-key summary only).'),
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
  description: 'Trace config dependency graph. Returns requires and/or required_by lists. Use before delete or rename.',
  inputSchema: {
    config_name: z.string().describe('Root config machine name.'),
    max_depth: z.number().default(3).describe('Transitive hop limit. Integer ≥1. Default 3.'),
    direction: z.enum(['requires', 'required_by', 'both']).default('both')
      .describe('requires=upstream deps, required_by=dependents, both=full graph.'),
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
  description: 'Resolve config provider (module, profile, or recipe). Returns owner path hints. Use for default config origin.',
  inputSchema: {
    config_name: z.string().describe('Config machine name to resolve.'),
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
  description: 'List all active≠sync configs (Drupal StorageComparer via Drush PHP eval). Returns name + operation per item; on Drush failure returns drift_count=null with a warning. Use for site-wide drift audit.',
  inputSchema: {
    ...SharedArgsSchema.shape,
    prefix: z.string().optional()
      .describe('Filter by config name prefix. Example: views.view., field.storage.'),
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
  description: 'Score deploy risk for one config change. Returns risk_level, touched_domains, followups. Use before cim.',
  inputSchema: {
    config_name: z.string().describe('Config machine name to assess.'),
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
  description: 'List Config Split definitions and enabled state. Returns split names, folders, complete_list (fully excluded) and partial_list (conditionally included), include_count, exclude_count. Use for multi-env deploy.',
  inputSchema: {
    split_name: z.string().optional()
      .describe('Split machine name. Omit to list all splits.'),
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
  description: '[Best-effort] Report applied Drupal Recipes (D10.3+). Returns recipe_name, managed_config_count, missing_count, changed_count, supported. NOTE: Drupal has no stable public API for applied recipe state; results are best-effort estimates.',
  inputSchema: {
    recipe_name: z.string().optional()
      .describe('Recipe machine name. Omit to list all applied recipes.'),
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
  description: 'Aggregate deploy risk across drift + splits. Returns summary (string), highest_risk_items (string[]), blockers (string[]), suggested_checks (string[]). Takes no arguments. Use before config deploy.',
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
