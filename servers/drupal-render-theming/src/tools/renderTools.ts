import { z } from 'zod';
import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { buildEnvelope } from '@agent-forge/mcp-core';
import { RenderResolver } from '../render/renderResolver.js';

function findDrupalProjectRoot(startPath: string): string {
  let curr = resolve(startPath);
  while (curr !== dirname(curr)) {
    if (existsSync(resolve(curr, 'web', 'core'))) return curr;
    if (existsSync(resolve(curr, 'docroot', 'core'))) return curr;
    if (existsSync(resolve(curr, 'core')) && existsSync(resolve(curr, 'index.php'))) return curr;
    curr = dirname(curr);
  }
  return startPath;
}

const getRootDir = (args: any) => {
  const argRoot = args?.project_root;
  const envRoot = process.env.DRUPAL_ROOT_DIR || process.env.DRUPAL_ROOT;
  if (argRoot) return resolve(argRoot);
  if (envRoot) return resolve(envRoot);
  return findDrupalProjectRoot(process.cwd());
};

export const renderTools: any[] = [
  {
    name: 'inspect_theme_state',
    description: 'Get active theme, admin theme, base theme chain, region list and count. Use first for theme or layout context.',
    inputSchema: {
      project_root: z.string().optional().describe('Absolute path to the Drupal project root. Falls back to DRUPAL_ROOT_DIR / DRUPAL_ROOT env vars, then auto-detection from cwd.'),
    },
    handler: async (args: any) => {
      const resolver = new RenderResolver(getRootDir(args));
      const data = await resolver.getThemeState();
      if (data && 'error' in data) {
        return buildEnvelope({
          summary: `Error: ${data.error}`,
          data: [data],
        });
      }
      return buildEnvelope({
        summary: `Active theme: ${data.active_theme} (Base: ${data.base_theme_chain?.join(' > ') || 'None'})`,
        data: [data],
      });
    }
  },
  {
    name: 'inspect_template_suggestions',
    description: 'List theme_suggestions for a hook in priority order (last element wins). Use to see candidate templates before resolution. Supports node, block, and field hooks with automatic context setup.',
    inputSchema: {
      theme_hook: z.string().describe('Theme hook machine name. Examples: node, block, field.'),
      view_mode: z.string().optional().describe('View mode machine name used for node context. Default: full. Ignored for non-node hooks.'),
      route_name: z.string().optional().describe('Reserved for future use. Not yet applied to suggestion context.'),
      project_root: z.string().optional().describe('Absolute path to the Drupal project root. Falls back to DRUPAL_ROOT_DIR / DRUPAL_ROOT env vars, then auto-detection from cwd.'),
    },
    handler: async (args: any) => {
      const resolver = new RenderResolver(getRootDir(args));
      const data = await resolver.getTemplateSuggestions(args);
      if (data && 'error' in data) {
        return buildEnvelope({
          summary: `Error: ${data.error}`,
          data: [data],
        });
      }
      return buildEnvelope({
        summary: `Found ${data.suggestions?.length || 0} suggestions for ${args.theme_hook}.`,
        data: [data],
      });
    }
  },
  {
    name: 'trace_template_resolution',
    description: 'Get template name, template path, type, and preprocess functions from the theme registry for a theme hook. Returns the same registry entry as find_preprocess_chain — use when you need to pinpoint which template file is registered for a hook.',
    inputSchema: {
      theme_hook: z.string().describe('Theme hook from #theme key or theme registry. Examples: node, block, views_view.'),
      project_root: z.string().optional().describe('Absolute path to the Drupal project root. Falls back to DRUPAL_ROOT_DIR / DRUPAL_ROOT env vars, then auto-detection from cwd.'),
    },
    handler: async (args: any) => {
      const resolver = new RenderResolver(getRootDir(args));
      const data = await resolver.getPreprocessChain(args.theme_hook);
      if (data && 'error' in data) {
        return buildEnvelope({
          summary: `Error: ${data.error}`,
          data: [data],
        });
      }
      return buildEnvelope({
        summary: `Resolved ${args.theme_hook} to ${data.template_name || 'unknown'}.`,
        data: [data],
      });
    }
  },
  {
    name: 'find_preprocess_chain',
    description: 'List all preprocess functions registered for a theme hook, along with the template name, template path, and hook type from the theme registry. Use to debug template variable availability or preprocess alter order.',
    inputSchema: {
      theme_hook: z.string().describe('Theme hook machine name. Examples: node, block, views_view. Must exist in the active theme registry.'),
      project_root: z.string().optional().describe('Absolute path to the Drupal project root. Falls back to DRUPAL_ROOT_DIR / DRUPAL_ROOT env vars, then auto-detection from cwd.'),
    },
    handler: async (args: any) => {
      const resolver = new RenderResolver(getRootDir(args));
      const data = await resolver.getPreprocessChain(args.theme_hook);
      if (data && 'error' in data) {
        return buildEnvelope({
          summary: `Error: ${data.error}`,
          data: [data],
        });
      }
      return buildEnvelope({
        summary: `Preprocess chain for ${args.theme_hook} contains ${data.preprocess_functions?.length || 0} functions.`,
        data: [data],
      });
    }
  },
  {
    name: 'inspect_render_array',
    description: 'Build and preview the render array for a node or block entity. Returns a summary (#theme / #type, top-level keys) and a depth-limited preview. Noisy keys #cache and #attached are stripped from the preview to save tokens. Use to debug missing or extra render elements.',
    inputSchema: {
      target_type: z.enum(['node', 'block']).describe('Entity type to inspect: "node" or "block".'),
      target_id: z.string().describe('Entity identifier. For node: numeric nid as string (e.g. "42"). For block: block config entity id (e.g. "claro_help").'),
      view_mode: z.string().optional().describe('View mode machine name. Applies to node only. Default: full.'),
      max_depth: z.number().int().optional().describe('Maximum nesting depth for the render array preview. Integer. Default: 3. Increase to 5 for deeper inspection.'),
      project_root: z.string().optional().describe('Absolute path to the Drupal project root. Falls back to DRUPAL_ROOT_DIR / DRUPAL_ROOT env vars, then auto-detection from cwd.'),
    },
    handler: async (args: any) => {
       const resolver = new RenderResolver(getRootDir(args));
       const data = await resolver.getRenderArray(args.target_type, args.target_id, args);
       if (data && 'error' in data) {
         return buildEnvelope({
           summary: `Error: ${data.error}`,
           data: [data],
         });
       }
       return buildEnvelope({
         summary: `Projected render array for ${args.target_type}:${args.target_id}.`,
         data: [data],
       });
    }
  },
  {
    name: 'inspect_library_attachments',
    description: 'List #attached library names and top-level drupalSettings keys for a node or block render. Use to diagnose missing CSS/JS or unexpected library loading.',
    inputSchema: {
      target_type: z.enum(['node', 'block']).describe('Entity type to inspect: "node" or "block".'),
      target_id: z.string().describe('Entity identifier. For node: numeric nid as string (e.g. "42"). For block: block config entity id (e.g. "claro_help").'),
      project_root: z.string().optional().describe('Absolute path to the Drupal project root. Falls back to DRUPAL_ROOT_DIR / DRUPAL_ROOT env vars, then auto-detection from cwd.'),
    },
    handler: async (args: any) => {
       const resolver = new RenderResolver(getRootDir(args));
       const data = await resolver.getLibraryAttachments(args.target_type, args.target_id);
       if (data && 'error' in data) {
         return buildEnvelope({
           summary: `Error: ${data.error}`,
           data: [data],
         });
       }
       return buildEnvelope({
         summary: `Target ${args.target_id} has ${data.libraries?.length || 0} attached libraries.`,
         data: [data],
       });
    }
  },
  {
    name: 'inspect_blocks_and_regions',
    description: 'List all blocks placed in the default theme with their id, label, region, plugin_id, weight, and status. Optionally filter by a specific region. Use for layout debugging and block placement verification.',
    inputSchema: {
      region: z.string().optional().describe('Region machine name to filter by (e.g. "header", "content"). Omit to return blocks from all regions.'),
      project_root: z.string().optional().describe('Absolute path to the Drupal project root. Falls back to DRUPAL_ROOT_DIR / DRUPAL_ROOT env vars, then auto-detection from cwd.'),
    },
    handler: async (args: any) => {
        const resolver = new RenderResolver(getRootDir(args));
        const data = await resolver.getBlocksAndRegions(args.region);
        if (data && 'error' in data) {
          return buildEnvelope({
            summary: `Error: ${data.error}`,
            data: [data],
          });
        }
        return buildEnvelope({
          summary: `Found ${data.length} blocks placed in theme regions.`,
          data: Array.isArray(data) ? data : [data],
        });
    }
  },
  {
    name: 'inspect_sdc_components',
    description: 'List or fetch Single Directory Component (SDC) definitions. Without component_id returns a summary list with fields: id, extension (provider), path, has_schema (bool). With component_id returns the raw plugin definition object for that component. Requires SDC module enabled.',
    inputSchema: {
      component_id: z.string().optional().describe('Component id in "namespace:name" format (e.g. "core:button", "my_theme:card"). Omit to list all available components.'),
      project_root: z.string().optional().describe('Absolute path to the Drupal project root. Falls back to DRUPAL_ROOT_DIR / DRUPAL_ROOT env vars, then auto-detection from cwd.'),
    },
    handler: async (args: any) => {
        const resolver = new RenderResolver(getRootDir(args));
        const data = await resolver.getSdcComponents(args.component_id);
        if (data && 'error' in data) {
          return buildEnvelope({
            summary: `Error: ${data.error}`,
            data: [data],
          });
        }
        return buildEnvelope({
          summary: args.component_id ? `SDC Component: ${args.component_id}` : `Found ${data.length} SDC components.`,
          data: Array.isArray(data) ? data : [data],
        });
    }
  },
  {
    name: 'summarize_render_path',
    description: 'End-to-end render pipeline summary for a node or block: resolves theme_hook, template name, template path, preprocess function count, and attached library count. Use as a fast overview before diving into inspect_render_array or find_preprocess_chain.',
    inputSchema: {
      target_type: z.enum(['node', 'block']).describe('Entity type to summarize: "node" or "block".'),
      target_id: z.string().describe('Entity identifier. For node: numeric nid as string (e.g. "42"). For block: block config entity id (e.g. "claro_help").'),
      project_root: z.string().optional().describe('Absolute path to the Drupal project root. Falls back to DRUPAL_ROOT_DIR / DRUPAL_ROOT env vars, then auto-detection from cwd.'),
    },
    handler: async (args: any) => {
      const resolver = new RenderResolver(getRootDir(args));
      const [render, libs] = await Promise.all([
        resolver.getRenderArray(args.target_type, args.target_id, args),
        resolver.getLibraryAttachments(args.target_type, args.target_id)
      ]);
      
      if (render.error || libs.error) {
        return buildEnvelope({
          summary: `Error: ${render.error || libs.error}`,
          data: [render.error ? render : libs],
        });
      }

      const themeHook = render.summary.theme_hook;
      const preprocess = await resolver.getPreprocessChain(themeHook);
      
      const summary = {
        target: `${args.target_type}:${args.target_id}`,
        theme_hook: themeHook,
        template: preprocess.template_name,
        template_path: preprocess.template_path,
        preprocess_count: preprocess.preprocess_functions?.length || 0,
        library_count: libs.libraries?.length || 0,
      };

      return buildEnvelope({
        summary: `Render Path: ${themeHook} -> ${preprocess.template_name} (${libs.libraries?.length || 0} libs)`,
        data: [summary],
      });
    }
  }
];
