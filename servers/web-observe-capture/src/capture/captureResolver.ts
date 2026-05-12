import { Page, ElementHandle } from 'playwright';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { v4 as uuidv4 } from 'uuid';

export class CaptureResolver {
  private artifactsDir: string;

  constructor(artifactsDir?: string) {
    this.artifactsDir = artifactsDir || resolve(process.cwd(), 'artifacts');
    mkdirSync(this.artifactsDir, { recursive: true });
  }

  private generateImagePath(prefix: string): string {
    return resolve(this.artifactsDir, `${prefix}_${Date.now()}_${uuidv4().slice(0, 8)}.png`);
  }

  async fullPage(page: Page) {
    const path = this.generateImagePath('full_page');
    await page.screenshot({ path, fullPage: true });
    const size = page.viewportSize();
    return {
      image_path: path,
      width: size?.width,
      height: size?.height,
      full_page: true
    };
  }

  async viewport(page: Page) {
    const path = this.generateImagePath('viewport');
    await page.screenshot({ path });
    const size = page.viewportSize();
    return {
      image_path: path,
      width: size?.width,
      height: size?.height,
    };
  }

  async region(page: Page, options: any) {
    let clip: any = undefined;
    let source = 'coordinates';

    if (options.selector) {
      const element = await page.$(options.selector);
      if (element) {
        const box = await element.boundingBox();
        if (box) {
          clip = box;
          source = `selector:${options.selector}`;
        }
      }
    } else if (options.x !== undefined && options.y !== undefined) {
      clip = {
        x: options.x,
        y: options.y,
        width: options.width || 100,
        height: options.height || 100
      };
    }

    const path = this.generateImagePath('region');
    await page.screenshot({ path, clip });
    return {
      image_path: path,
      bounds: clip,
      source
    };
  }

  /**
   * inspect_dom_excerpt: Get bounded HTML/text
   */
  async domExcerpt(page: Page, options: any) {
    const selector = options.selector || 'body';
    const maxChars = options.max_chars || 1000;
    
    const excerpt = await page.evaluate(({ selector, includeOuter, limit }) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const html = includeOuter ? el.outerHTML : el.innerHTML;
      if (html.length > limit) {
        return { text: html.slice(0, limit), truncated: true };
      }
      return { text: html, truncated: false };
    }, { selector, includeOuter: options.include_outer_html, limit: maxChars });

    if (!excerpt) return { source: selector, found: false };

    return {
      source: selector,
      found: true,
      excerpt: excerpt.text,
      truncated: excerpt.truncated
    };
  }

  /**
   * inspect_layout: Geometries and overlaps
   */
  async inspectLayout(page: Page, selectors: string[]) {
    const items = await page.evaluate((selList) => {
      return selList.map(sel => {
        const el = document.querySelector(sel);
        if (!el) return { selector: sel, found: false };
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return {
          selector: sel,
          found: true,
          bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          styles: {
            display: style.display,
            visibility: style.visibility,
            opacity: style.opacity,
            zIndex: style.zIndex,
            overflow: style.overflow
          }
        };
      });
    }, selectors);

    return {
      inspected_count: items.length,
      items
    };
  }

  /**
   * capture_page_snapshot: Structured page summary
   */
  async pageSnapshot(page: Page, options: any) {
    const maxNodes = options.max_nodes || 50;
    const snapshot = await page.evaluate((limit) => {
      const nodes = Array.from(document.querySelectorAll('*')).slice(0, limit);
      return nodes.map(n => ({
        tag: n.tagName.toLowerCase(),
        id: n.id,
        classes: Array.from(n.classList),
        text_preview: (n.textContent || '').slice(0, 30).trim()
      }));
    }, maxNodes);

    return {
      node_count: snapshot.length,
      summary: `Page snapshot with ${snapshot.length} nodes (capped at ${maxNodes})`,
      excerpt: snapshot
    };
  }
}
