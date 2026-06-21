import { z } from 'zod';
import { buildEnvelope } from '@agent-forge/mcp-core';
import { BrowserManager } from '../browser/browserManager.js';
import { CaptureResolver } from '../capture/captureResolver.js';

const browserManager = BrowserManager.getInstance();
const resolver = new CaptureResolver();

export const captureTools: any[] = [
  {
    name: 'open_page_session',
    description:
      'Open headless browser for URL. Returns session_id — required by all other tools. Reuse session_id to keep cookies and page state.',
    inputSchema: {
      url: z.string().url().describe('Absolute HTTP(S) URL to navigate to.'),
      wait_until: z
        .enum(['load', 'domcontentloaded', 'networkidle', 'commit'])
        .optional()
        .default('networkidle')
        .describe('Navigation wait: load | domcontentloaded | networkidle | commit. Default networkidle.'),
      width: z.number().optional().default(1280).describe('Viewport width in px. Default 1280.'),
      height: z.number().optional().default(720).describe('Viewport height in px. Default 720.'),
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
    description:
      'Screenshot full scrollable page. Returns PNG image_path in artifacts/. Use when content extends below the fold.',
    inputSchema: {
      session_id: z.string().describe('session_id from open_page_session. UUID string.'),
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
    description:
      'Screenshot visible viewport at current scroll position. Returns PNG image_path. Use for above-the-fold or quick visual check.',
    inputSchema: {
      session_id: z.string().describe('session_id from open_page_session. UUID string.'),
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
    description:
      'Screenshot one element or pixel rectangle. Returns PNG image_path and bounds. Prefer selector; use x/y/width/height when element has no selector.',
    inputSchema: {
      session_id: z.string().describe('session_id from open_page_session. UUID string.'),
      selector: z.string().optional().describe('CSS selector of element to capture. Takes precedence over coordinates.'),
      x: z.number().optional().describe('Clip origin X in px. Requires y; ignored when selector matches.'),
      y: z.number().optional().describe('Clip origin Y in px. Requires x; ignored when selector matches.'),
      width: z.number().optional().describe('Clip width in px. Default 100 when using coordinates.'),
      height: z.number().optional().describe('Clip height in px. Default 100 when using coordinates.'),
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
    description:
      'Get truncated HTML for one CSS selector. Returns excerpt and truncated flag. Use for targeted markup; not full-page HTML.',
    inputSchema: {
      session_id: z.string().describe('session_id from open_page_session. UUID string.'),
      selector: z.string().optional().default('body').describe('CSS selector of element. Default body.'),
      max_chars: z.number().optional().default(2000).describe('Max HTML character count before truncate. Default 2000.'),
      include_outer_html: z
        .boolean()
        .optional()
        .default(false)
        .describe('true = outerHTML (element + children); false = innerHTML. Default false.'),
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
    description:
      'Get bounding boxes and computed styles (display, visibility, opacity, z-index, overflow) per CSS selector. Use for overlap, spacing, or hidden-element debugging.',
    inputSchema: {
      session_id: z.string().describe('session_id from open_page_session. UUID string.'),
      selectors: z.array(z.string()).describe('CSS selectors to inspect. Each item returns bounds + styles or found:false.'),
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
    description:
      'Token-efficient DOM outline: tag, id, classes, text_preview per node. Use for page structure overview without raw HTML.',
    inputSchema: {
      session_id: z.string().describe('session_id from open_page_session. UUID string.'),
      max_nodes: z.number().optional().default(100).describe('Max DOM nodes to include. Default 100.'),
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
    description: 'Close browser context and release session resources. Call after all capture/inspect steps are done.',
    inputSchema: {
      session_id: z.string().describe('session_id from open_page_session to close. UUID string.'),
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
