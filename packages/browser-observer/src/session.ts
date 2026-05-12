/**
 * Browser session lifecycle management for web observation.
 * Wraps Puppeteer/Playwright to provide a consistent session API
 * for screenshot and DOM capture operations.
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

// ---------- Types ----------

export interface BrowserSessionConfig {
  /** Headless mode. Default: true. */
  headless?: boolean;
  /** Default viewport width. Default: 1280. */
  viewportWidth?: number;
  /** Default viewport height. Default: 800. */
  viewportHeight?: number;
  /** Navigation timeout in ms. Default: 30000. */
  timeout?: number;
  /** User agent string override. */
  userAgent?: string;
  /** Extra HTTP headers to send with every request. */
  extraHeaders?: Record<string, string>;
  /** Auth credentials for HTTP basic auth on the target site. */
  auth?: { username: string; password: string };
}

export interface PageState {
  /** Current URL. */
  url: string;
  /** Page title. */
  title: string;
  /** HTTP status of the main frame. */
  status: number;
  /** Whether the page has finished loading. */
  loaded: boolean;
  /** Viewport dimensions. */
  viewport: { width: number; height: number };
}

export interface BrowserSession {
  /** Navigate to a URL and wait for load. */
  goto(url: string): Promise<PageState>;
  /** Get current page state. */
  getState(): Promise<PageState>;
  /** Close the session and release resources. */
  close(): Promise<void>;
  /** Whether the session is currently active. */
  isActive(): boolean;
}

// ---------- Session Factory ----------

/**
 * Create a browser session.
 *
 * Implementation deferred — this is the contract interface.
 * When implemented, this will use Puppeteer or Playwright
 * depending on available dependencies.
 *
 * Usage:
 * ```ts
 * const session = await createSession({ headless: true });
 * await session.goto('https://example.com');
 * const state = await session.getState();
 * await session.close();
 * ```
 */
export async function createSession(_config?: BrowserSessionConfig): Promise<BrowserSession> {
  const config = {
    ...DEFAULT_SESSION_CONFIG,
    ...(_config ?? {}),
  };

  const browser: Browser = await chromium.launch({ headless: config.headless });
  const context: BrowserContext = await browser.newContext({
    viewport: {
      width: config.viewportWidth,
      height: config.viewportHeight,
    },
    userAgent: config.userAgent || undefined,
    extraHTTPHeaders: config.extraHeaders,
    httpCredentials:
      config.auth.username || config.auth.password
        ? { username: config.auth.username, password: config.auth.password }
        : undefined,
  });

  const page: Page = await context.newPage();
  let active = true;
  let lastState: PageState = {
    url: '',
    title: '',
    status: 0,
    loaded: false,
    viewport: { width: config.viewportWidth, height: config.viewportHeight },
  };

  return {
    async goto(url: string): Promise<PageState> {
      const response = await page.goto(url, {
        timeout: config.timeout,
        waitUntil: 'domcontentloaded',
      });

      const title = await page.title();
      const viewport = page.viewportSize() ?? {
        width: config.viewportWidth,
        height: config.viewportHeight,
      };

      lastState = {
        url: page.url(),
        title,
        status: response?.status() ?? 0,
        loaded: true,
        viewport,
      };

      return lastState;
    },
    async getState(): Promise<PageState> {
      if (!active) {
        return {
          ...lastState,
          loaded: false,
        };
      }

      const viewport = page.viewportSize() ?? lastState.viewport;
      return {
        ...lastState,
        url: page.url() || lastState.url,
        title: (await page.title()) || lastState.title,
        viewport,
      };
    },
    async close(): Promise<void> {
      if (!active) return;
      active = false;
      await context.close();
      await browser.close();
    },
    isActive(): boolean {
      return active;
    },
  };
}

// ---------- Session Manager ----------

export class SessionManager {
  private sessions = new Map<string, BrowserSession>();

  async createSession(url: string, config?: BrowserSessionConfig): Promise<BrowserSession & { id: string; url: string }> {
    const session = await createSession(config);
    const id = Math.random().toString(36).substring(7);
    await session.goto(url);
    const sessionWithId = Object.assign(session, { id, url });
    this.sessions.set(id, sessionWithId);
    return sessionWithId;
  }

  getSession(id: string): (BrowserSession & { id: string; url: string }) | undefined {
    return this.sessions.get(id) as any;
  }

  async closeSession(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (session) {
      await session.close();
      this.sessions.delete(id);
    }
  }
}

/**
 * Default session configuration values.
 */
export const DEFAULT_SESSION_CONFIG: Required<BrowserSessionConfig> = {
  headless: true,
  viewportWidth: 1280,
  viewportHeight: 800,
  timeout: 30_000,
  userAgent: '',
  extraHeaders: {},
  auth: { username: '', password: '' },
};
