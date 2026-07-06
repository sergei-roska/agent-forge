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
    description: 'Get active theme, admin theme, base theme chain, regions. Use first for theme or layout context.',
    inputSchema: {},
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
    description: 'List theme_suggestions for a hook in priority order (last wins). Use to see candidate templates before resolution.',
    inputSchema: {
      theme_hook: z.string().describe('Theme hook machine name. Examples: node, block, container, field.'),
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
    description: 'Get resolved template name, path, and registry entry for a theme hook. Use when wrong or missing template file.',
    inputSchema: {
      theme_hook: z.string().describe('Theme hook from #theme or registry. Examples: node, block, views_view.'),
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
    description: 'List preprocess functions and template registry for a theme hook. Use to debug template variables or alter order.',
    inputSchema: {
      theme_hook: z.string().describe('Theme hook machine name. Same target as trace_template_resolution.'),
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
    description: 'Build and preview node/block render array (#theme, keys, nested structure). Use to debug missing or extra elements.',
    inputSchema: {
      target_type: z.enum(['node', 'block']).describe('Entity type: node or block.'),
      target_id: z.string().describe('Node nid as string, or block config id (e.g. claro_help).'),
      view_mode: z.string().optional().describe('View mode machine_name. Node only. Default: full.'),
      max_depth: z.number().optional().describe('Max nested array depth. Integer. Default 3.'),
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
    description: 'List #attached libraries and drupalSettings keys for node/block render. Use for CSS/JS loading issues.',
    inputSchema: {
      target_type: z.enum(['node', 'block']).describe('Entity type: node or block.'),
      target_id: z.string().describe('Node nid as string, or block config id.'),
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
    description: 'List blocks in active theme: id, region, weight, plugin, status. Use for layout and block placement.',
    inputSchema: {
      region: z.string().optional().describe('Region machine_name filter. Omit to return all regions.'),
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
    description: 'List or fetch Single Directory Component definitions (id, provider, path, schema). Requires SDC module enabled.',
    inputSchema: {
       component_id: z.string().optional().describe('Component id namespace:name (e.g. core:button). Omit to list all.'),
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
    description: 'End-to-end render pipeline for node/block: theme_hook, template, preprocess count, library count. Use for overview without full array.',
    inputSchema: {
       target_type: z.enum(['node', 'block']).describe('Entity type: node or block.'),
       target_id: z.string().describe('Node nid as string, or block config id.'),
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
