import { z } from 'zod';
import { buildEnvelope } from '@agent-forge/mcp-core';
import { BrowserManager } from '../browser/browserManager.js';
import { CaptureResolver } from '../capture/captureResolver.js';

const browserManager = BrowserManager.getInstance();
const resolver = new CaptureResolver();

export const captureTools: any[] = [
  {
    name: 'open_page_session',
    description: 'Open a new browser session for a given URL.',
    inputSchema: {
      url: z.string().url().describe('URL to open.'),
      wait_until: z.enum(['load', 'domcontentloaded', 'networkidle', 'commit']).optional().default('networkidle'),
      width: z.number().optional().default(1280),
      height: z.number().optional().default(720),
    },
    handler: async (args: any) => {
      const session = await browserManager.openSession(args.url, {
        viewport: { width: args.width, height: args.height },
        wait_until: args.wait_until
      });
      return buildEnvelope({
        summary: `Opened session ${session.id} at ${args.url}`,
        data: [{
          session_id: session.id,
          url: session.url,
          title: await session.page.title(),
          viewport: { width: args.width, height: args.height }
        }]
      });
    }
  },
  {
    name: 'capture_full_page_screenshot',
    description: 'Capture a full-page screenshot for a session.',
    inputSchema: {
      session_id: z.string().describe('Active session ID.'),
    },
    handler: async (args: any) => {
      const session = await browserManager.getSession(args.session_id);
      if (!session) throw new Error('Session not found');
      const data = await resolver.fullPage(session.page);
      return buildEnvelope({
        summary: `Full page screenshot saved to ${data.image_path}`,
        data: [data]
      });
    }
  },
  {
    name: 'capture_viewport_screenshot',
    description: 'Capture current viewport screenshot.',
    inputSchema: {
      session_id: z.string().describe('Active session ID.'),
    },
    handler: async (args: any) => {
      const session = await browserManager.getSession(args.session_id);
      if (!session) throw new Error('Session not found');
      const data = await resolver.viewport(session.page);
      return buildEnvelope({
        summary: `Viewport screenshot saved to ${data.image_path}`,
        data: [data]
      });
    }
  },
  {
    name: 'capture_region_screenshot',
    description: 'Capture a specific region or element screenshot.',
    inputSchema: {
      session_id: z.string().describe('Active session ID.'),
      selector: z.string().optional().describe('CSS selector to capture.'),
      x: z.number().optional().describe('X coordinate.'),
      y: z.number().optional().describe('Y coordinate.'),
      width: z.number().optional().describe('Region width.'),
      height: z.number().optional().describe('Region height.'),
    },
    handler: async (args: any) => {
      const session = await browserManager.getSession(args.session_id);
      if (!session) throw new Error('Session not found');
      const data = await resolver.region(session.page, args);
      return buildEnvelope({
        summary: `Region screenshot (${data.source}) saved to ${data.image_path}`,
        data: [data]
      });
    }
  },
  {
    name: 'inspect_dom_excerpt',
    description: 'Retrieve bounded HTML/text content for a selector.',
    inputSchema: {
      session_id: z.string().describe('Active session ID.'),
      selector: z.string().optional().default('body').describe('CSS selector.'),
      max_chars: z.number().optional().default(2000).describe('Truncation limit.'),
      include_outer_html: z.boolean().optional().default(false).describe('Include outer HTML.'),
    },
    handler: async (args: any) => {
      const session = await browserManager.getSession(args.session_id);
      if (!session) throw new Error('Session not found');
      const data = await resolver.domExcerpt(session.page, args);
      return buildEnvelope({
        summary: data.found ? `Excerpt for ${args.selector} (${data.excerpt.length} chars)` : `Selector ${args.selector} not found`,
        data: [data]
      });
    }
  },
  {
    name: 'inspect_layout',
    description: 'Retrieve bounding boxes and styles for a list of selectors.',
    inputSchema: {
      session_id: z.string().describe('Active session ID.'),
      selectors: z.array(z.string()).describe('List of CSS selectors.'),
    },
    handler: async (args: any) => {
      const session = await browserManager.getSession(args.session_id);
      if (!session) throw new Error('Session not found');
      const data = await resolver.inspectLayout(session.page, args.selectors);
      return buildEnvelope({
        summary: `Inspected layout for ${data.inspected_count} elements.`,
        data: [data]
      });
    }
  },
  {
    name: 'capture_page_snapshot',
    description: 'Generate a structured DOM snapshot summary.',
    inputSchema: {
      session_id: z.string().describe('Active session ID.'),
      max_nodes: z.number().optional().default(100).describe('Max nodes to summary.'),
    },
    handler: async (args: any) => {
      const session = await browserManager.getSession(args.session_id);
      if (!session) throw new Error('Session not found');
      const data = await resolver.pageSnapshot(session.page, args);
      return buildEnvelope({
        summary: data.summary,
        data: [data]
      });
    }
  },
  {
    name: 'close_page_session',
    description: 'Close an active browser session.',
    inputSchema: {
      session_id: z.string().describe('Session ID to close.'),
    },
    handler: async (args: any) => {
      const success = await browserManager.closeSession(args.session_id);
      return buildEnvelope({
        summary: success ? `Session ${args.session_id} closed.` : `Session ${args.session_id} not found.`,
        data: [{ session_id: args.session_id, closed: success }]
      });
    }
  }
];
