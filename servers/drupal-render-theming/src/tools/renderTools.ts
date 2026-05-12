import { z } from 'zod';
import { buildEnvelope } from '@agent-forge/mcp-core';
import { RenderResolver } from '../render/renderResolver.js';

const getRootDir = (args: any) => args.project_root || process.cwd();

export const renderTools: any[] = [
  {
    name: 'inspect_theme_state',
    description: 'Summarize active theme, base theme chain, and region metadata.',
    inputSchema: {},
    handler: async (args: any) => {
      const resolver = new RenderResolver(getRootDir(args));
      const data = await resolver.getThemeState();
      return buildEnvelope({
        summary: `Active theme: ${data.active_theme} (Base: ${data.base_theme_chain.join(' > ') || 'None'})`,
        data: [data],
      });
    }
  },
  {
    name: 'inspect_template_suggestions',
    description: 'Return ordered template suggestions for a specific theme hook.',
    inputSchema: {
      theme_hook: z.string().describe('The base theme hook (e.g. node, block, container).'),
    },
    handler: async (args: any) => {
      const resolver = new RenderResolver(getRootDir(args));
      const data = await resolver.getTemplateSuggestions(args);
      return buildEnvelope({
        summary: `Found ${data.suggestions.length} suggestions for ${args.theme_hook}.`,
        data: [data],
      });
    }
  },
  {
    name: 'trace_template_resolution',
    description: 'Explain which template file is resolving for a hook and why.',
    inputSchema: {
      theme_hook: z.string().describe('The base theme hook.'),
    },
    handler: async (args: any) => {
      const resolver = new RenderResolver(getRootDir(args));
      const data = await resolver.getPreprocessChain(args.theme_hook);
      return buildEnvelope({
        summary: `Resolved ${args.theme_hook} to ${data.template_name || 'unknown'}.`,
        data: [data],
      });
    }
  },
  {
    name: 'find_preprocess_chain',
    description: 'List all preprocess functions and registry info for a render target.',
    inputSchema: {
      theme_hook: z.string().describe('The base theme hook.'),
    },
    handler: async (args: any) => {
      const resolver = new RenderResolver(getRootDir(args));
      const data = await resolver.getPreprocessChain(args.theme_hook);
      return buildEnvelope({
        summary: `Preprocess chain for ${args.theme_hook} contains ${data.preprocess_functions?.length || 0} functions.`,
        data: [data],
      });
    }
  },
  {
    name: 'inspect_render_array',
    description: 'Bounded inspection of a render array structure (Entities, Blocks).',
    inputSchema: {
      target_type: z.enum(['node', 'block']).describe('Type of render target.'),
      target_id: z.string().describe('Machine name or Entity ID.'),
      view_mode: z.string().optional().describe('Drupal view mode (default: full).'),
      max_depth: z.number().optional().describe('Maximum recursion depth for noise reduction (default 3).'),
    },
    handler: async (args: any) => {
       const resolver = new RenderResolver(getRootDir(args));
       const data = await resolver.getRenderArray(args.target_type, args.target_id, args);
       return buildEnvelope({
         summary: `Projected render array for ${args.target_type}:${args.target_id}.`,
         data: [data],
       });
    }
  },
  {
    name: 'inspect_library_attachments',
    description: 'Identify attached CSS/JS libraries for a specific render target.',
    inputSchema: {
      target_type: z.enum(['node', 'block']).describe('Type of render target.'),
      target_id: z.string().describe('Machine name or ID.'),
    },
    handler: async (args: any) => {
       const resolver = new RenderResolver(getRootDir(args));
       const data = await resolver.getLibraryAttachments(args.target_type, args.target_id);
       return buildEnvelope({
         summary: `Target ${args.target_id} has ${data.libraries.length} attached libraries.`,
         data: [data],
       });
    }
  },
  {
    name: 'inspect_blocks_and_regions',
    description: 'Summarize block placement and regions for the active theme.',
    inputSchema: {
      region: z.string().optional().describe('Filter by specific region.'),
    },
    handler: async (args: any) => {
       const resolver = new RenderResolver(getRootDir(args));
       const data = await resolver.getBlocksAndRegions(args.region);
       return buildEnvelope({
         summary: `Found ${data.length} blocks placed in theme regions.`,
         data: Array.isArray(data) ? data : [data],
       });
    }
  },
  {
    name: 'inspect_sdc_components',
    description: 'Summarize Single Directory Components (SDC) metadata and paths.',
    inputSchema: {
       component_id: z.string().optional().describe('Specific component ID (e.g. core:button).')
    },
    handler: async (args: any) => {
       const resolver = new RenderResolver(getRootDir(args));
       const data = await resolver.getSdcComponents(args.component_id);
       return buildEnvelope({
         summary: args.component_id ? `SDC Component: ${args.component_id}` : `Found ${data.length} SDC components.`,
         data: Array.isArray(data) ? data : [data],
       });
    }
  },
  {
    name: 'summarize_render_path',
    description: 'Compact end-to-end explanation from data to template for a target.',
    inputSchema: {
       target_type: z.enum(['node', 'block']).describe('Target type.'),
       target_id: z.string().describe('Target ID.')
    },
    handler: async (args: any) => {
      const resolver = new RenderResolver(getRootDir(args));
      const [render, libs] = await Promise.all([
        resolver.getRenderArray(args.target_type, args.target_id),
        resolver.getLibraryAttachments(args.target_type, args.target_id)
      ]);
      const themeHook = render.summary.theme_hook;
      const preprocess = await resolver.getPreprocessChain(themeHook);
      
      const summary = {
        target: `${args.target_type}:${args.target_id}`,
        theme_hook: themeHook,
        template: preprocess.template_name,
        template_path: preprocess.template_path,
        preprocess_count: preprocess.preprocess_functions?.length || 0,
        library_count: libs.libraries.length,
      };

      return buildEnvelope({
        summary: `Render Path: ${themeHook} -> ${preprocess.template_name} (${libs.libraries.length} libs)`,
        data: [summary],
      });
    }
  }
];
