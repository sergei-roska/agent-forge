import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { v4 as uuidv4 } from 'uuid';

export interface Session {
  id: string;
  context: BrowserContext;
  page: Page;
  url: string;
  createdAt: Date;
}

export class BrowserManager {
  private static instance: BrowserManager;
  private browser: Browser | null = null;
  private sessions: Map<string, Session> = new Map();

  private constructor() {}

  static getInstance(): BrowserManager {
    if (!BrowserManager.instance) {
      BrowserManager.instance = new BrowserManager();
    }
    return BrowserManager.instance;
  }

  async ensureBrowser() {
    if (!this.browser) {
      this.browser = await chromium.launch({ headless: true });
    }
    return this.browser;
  }

  async openSession(url: string, options: any = {}): Promise<Session> {
    const browser = await this.ensureBrowser();
    const context = await browser.newContext({
      viewport: options.viewport || { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Forge MCP Server; Browser Observation)',
    });
    
    const page = await context.newPage();
    await page.goto(url, { waitUntil: options.wait_until || 'networkidle' });

    const sessionId = uuidv4();
    const session: Session = {
      id: sessionId,
      context,
      page,
      url,
      createdAt: new Date(),
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  async getSession(sessionId: string): Promise<Session | undefined> {
    return this.sessions.get(sessionId);
  }

  async closeSession(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (session) {
      await session.context.close();
      this.sessions.delete(sessionId);
      return true;
    }
    return false;
  }

  async shutdown() {
    for (const id of this.sessions.keys()) {
      await this.closeSession(id);
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
