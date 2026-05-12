/**
 * Screenshot and DOM capture interfaces for web observation.
 * Defines the contract for all visual capture operations used by
 * the web-observe-capture server.
 */

import { chromium } from 'playwright';

// ---------- Types ----------

export interface ScreenshotOptions {
  /** Capture type. */
  type: 'full_page' | 'viewport' | 'region' | 'selector';
  /** CSS selector — required when type is 'selector'. */
  selector?: string;
  /** Region bounds — required when type is 'region'. */
  region?: { x: number; y: number; width: number; height: number };
  /** Image format. Default: 'png'. */
  format?: 'png' | 'jpeg' | 'webp';
  /** JPEG/WebP quality (0-100). Default: 80. */
  quality?: number;
  /** Scale factor. Default: 1. */
  scale?: number;
}

export interface ScreenshotResult {
  /** Raw image data as base64 string. */
  data: string;
  /** Image format used. */
  format: 'png' | 'jpeg' | 'webp';
  /** Image dimensions. */
  width: number;
  height: number;
  /** Size in bytes. */
  sizeBytes: number;
  /** Capture metadata. */
  meta: {
    type: ScreenshotOptions['type'];
    url: string;
    timestamp: string;
    selector?: string;
    region?: { x: number; y: number; width: number; height: number };
  };
}

export interface DomSnapshotOptions {
  /** CSS selector to scope the snapshot. If omitted, captures full page. */
  selector?: string;
  /** Maximum depth of DOM tree to capture. Default: 10. */
  maxDepth?: number;
  /** Include computed styles. Default: false. */
  includeStyles?: boolean;
  /** Include text content. Default: true. */
  includeText?: boolean;
  /** Maximum text content length per node. Default: 500. */
  maxTextLength?: number;
}

export interface DomNode {
  tag: string;
  id?: string;
  classes?: string[];
  attributes?: Record<string, string>;
  text?: string;
  children?: DomNode[];
}

export interface DomSnapshotResult {
  /** Root DOM node. */
  root: DomNode;
  /** Total number of nodes captured. */
  nodeCount: number;
  /** Whether the snapshot was truncated at maxDepth. */
  truncated: boolean;
  /** Capture metadata. */
  meta: {
    url: string;
    timestamp: string;
    selector?: string;
    maxDepth: number;
  };
}

// ---------- Capture Functions ----------

/**
 * Capture a screenshot of a page.
 *
 * Implementation deferred — this is the contract interface.
 */
export async function captureScreenshot(
  pageUrl: string,
  options?: ScreenshotOptions,
): Promise<ScreenshotResult> {
  const resolved: Required<Pick<ScreenshotOptions, 'type' | 'format' | 'quality' | 'scale'>> &
    Pick<ScreenshotOptions, 'selector' | 'region'> = {
    type: options?.type ?? 'viewport',
    format: options?.format ?? 'png',
    quality: options?.quality ?? 80,
    scale: options?.scale ?? 1,
    selector: options?.selector,
    region: options?.region,
  };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  try {
    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    let buffer: Buffer;
    if (resolved.type === 'full_page') {
      buffer = await page.screenshot({
        fullPage: true,
        type: resolved.format === 'webp' ? 'png' : resolved.format,
        quality: resolved.format === 'png' ? undefined : resolved.quality,
      });
    } else if (resolved.type === 'selector') {
      if (!resolved.selector) throw new Error('selector is required when type=selector');
      const locator = page.locator(resolved.selector).first();
      buffer = await locator.screenshot({
        type: resolved.format === 'webp' ? 'png' : resolved.format,
        quality: resolved.format === 'png' ? undefined : resolved.quality,
      });
    } else if (resolved.type === 'region') {
      if (!resolved.region) throw new Error('region is required when type=region');
      buffer = await page.screenshot({
        clip: resolved.region,
        type: resolved.format === 'webp' ? 'png' : resolved.format,
        quality: resolved.format === 'png' ? undefined : resolved.quality,
      });
    } else {
      buffer = await page.screenshot({
        fullPage: false,
        type: resolved.format === 'webp' ? 'png' : resolved.format,
        quality: resolved.format === 'png' ? undefined : resolved.quality,
      });
    }

    const pageSize = page.viewportSize() ?? { width: 1280, height: 800 };
    return {
      data: buffer.toString('base64'),
      format: resolved.format,
      width: pageSize.width,
      height: pageSize.height,
      sizeBytes: buffer.byteLength,
      meta: {
        type: resolved.type,
        url: page.url(),
        timestamp: new Date().toISOString(),
        selector: resolved.selector,
        region: resolved.region,
      },
    };
  } finally {
    await context.close();
    await browser.close();
  }
}

/**
 * Capture a DOM snapshot of a page or selector.
 *
 * Implementation deferred — this is the contract interface.
 */
export async function captureDomSnapshot(
  pageUrl: string,
  options?: DomSnapshotOptions,
): Promise<DomSnapshotResult> {
  const resolved = {
    selector: options?.selector,
    maxDepth: options?.maxDepth ?? 10,
    includeStyles: options?.includeStyles ?? false,
    includeText: options?.includeText ?? true,
    maxTextLength: options?.maxTextLength ?? 500,
  };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  try {
    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const snapshot = await page.evaluate(
      ({ selector, maxDepth, includeText, maxTextLength }) => {
        function walk(node: Element, depth: number, maxD: number): any {
          const children: Element[] = Array.from(node.children);
          const text = includeText ? (node.textContent || '').trim().slice(0, maxTextLength) : undefined;
          return {
            tag: node.tagName.toLowerCase(),
            id: node.id || undefined,
            classes: node.classList.length ? Array.from(node.classList) : undefined,
            attributes: (() => {
              const attrs: Record<string, string> = {};
              for (const a of Array.from(node.attributes)) attrs[a.name] = a.value;
              return Object.keys(attrs).length ? attrs : undefined;
            })(),
            text: text || undefined,
            children: depth >= maxD ? [] : children.map((c) => walk(c, depth + 1, maxD)),
          };
        }

        const rootEl = selector ? document.querySelector(selector) : document.documentElement;
        if (!rootEl) {
          return { root: { tag: 'missing' }, nodeCount: 0, truncated: false };
        }

        const root = walk(rootEl, 0, maxDepth);
        let nodeCount = 0;
        const stack = [root];
        while (stack.length) {
          const n = stack.pop();
          if (!n) continue;
          nodeCount += 1;
          if (n.children) stack.push(...n.children);
        }

        return { root, nodeCount, truncated: false };
      },
      {
        selector: resolved.selector,
        maxDepth: resolved.maxDepth,
        includeText: resolved.includeText,
        maxTextLength: resolved.maxTextLength,
      },
    );

    return {
      root: snapshot.root,
      nodeCount: snapshot.nodeCount,
      truncated: snapshot.truncated,
      meta: {
        url: page.url(),
        timestamp: new Date().toISOString(),
        selector: resolved.selector,
        maxDepth: resolved.maxDepth,
      },
    };
  } finally {
    await context.close();
    await browser.close();
  }
}
