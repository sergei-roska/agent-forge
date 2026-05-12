/**
 * Drupal HTTP client with retry, timeout, and structured error handling.
 *
 * This client is the shared access layer for all Drupal API calls.
 * It normalizes errors into McpError instances and supports configurable retry.
 */

import { type AuthStrategy, authHeaders } from '../auth.js';
import type { JsonApiIndexResponse, JsonApiResponse } from '../types.js';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

// ---------- Configuration ----------

export interface DrupalClientConfig {
  /** Base URL of the Drupal site (e.g., https://example.com). */
  baseUrl: string;
  /** Authentication strategy. */
  auth?: AuthStrategy;
  /** Request timeout in milliseconds. Default: 15000. */
  timeout?: number;
  /** Number of retries on transient errors (5xx, network). Default: 2. */
  retries?: number;
  /** Base delay between retries in ms (exponential backoff). Default: 500. */
  retryDelay?: number;
  /** Custom headers added to every request. */
  headers?: Record<string, string>;
}

// ---------- Error Types ----------

export class DrupalHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly url: string,
    public readonly body?: unknown,
  ) {
    super(`HTTP ${status} ${statusText} from ${url}`);
    this.name = 'DrupalHttpError';
  }

  get isRetryable(): boolean {
    return this.status >= 500 || this.status === 429;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isUnauthorized(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

// ---------- Client ----------

export class DrupalClient {
  private readonly config: Required<Pick<DrupalClientConfig, 'baseUrl' | 'timeout' | 'retries' | 'retryDelay'>>
    & Pick<DrupalClientConfig, 'auth' | 'headers'>;

  constructor(config: DrupalClientConfig) {
    this.config = {
      baseUrl: config.baseUrl.replace(/\/+$/, ''), // strip trailing slash
      auth: config.auth,
      timeout: config.timeout ?? 15_000,
      retries: config.retries ?? 2,
      retryDelay: config.retryDelay ?? 500,
      headers: config.headers,
    };
  }

  /**
   * GET request with automatic retry and error normalization.
   */
  async get<T = unknown>(path: string, params?: Record<string, string>): Promise<T> {
    const url = this.buildUrl(path, params);
    return this.fetchWithRetry<T>(url, { method: 'GET' });
  }

  /**
   * POST request with automatic retry and error normalization.
   */
  async post<T = unknown>(path: string, body?: unknown): Promise<T> {
    const url = this.buildUrl(path);
    return this.fetchWithRetry<T>(url, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * Fetch JSON:API index document from /jsonapi.
   * This is the canonical API-only discovery entrypoint in Drupal 10/11.
   */
  async getJsonApiIndex(): Promise<JsonApiIndexResponse> {
    return this.get<JsonApiIndexResponse>('/jsonapi');
  }

  /**
   * List available JSON:API resource collection keys.
   * Keys usually look like "node--article", "user--user", etc.
   */
  async listJsonApiResourceTypes(): Promise<string[]> {
    const index = await this.getJsonApiIndex();
    return Object.keys(index.links ?? {}).filter((k) => k.includes('--'));
  }

  /**
   * Fetch a JSON:API collection by resource type key (e.g. node--article).
   */
  async getJsonApiCollection(
    resourceType: string,
    params?: Record<string, string>,
  ): Promise<JsonApiResponse> {
    const normalized = resourceType.replace(/--/g, '/');
    return this.get<JsonApiResponse>(`/jsonapi/${normalized}`, params);
  }

  /**
   * Build a full URL from a path and optional query params.
   */
  private buildUrl(path: string, params?: Record<string, string>): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(`${this.config.baseUrl}${normalizedPath}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }
    return url.toString();
  }

  /**
   * Execute a fetch with exponential backoff retry.
   */
  private async fetchWithRetry<T>(url: string, init: RequestInit, attempt: number = 0): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          ...authHeaders(this.config.auth),
          ...(this.config.headers ?? {}),
          ...(init.headers ?? {}),
        },
      });

      if (!response.ok) {
        let body: unknown;
        try { body = await response.json(); } catch { body = await response.text().catch(() => null); }

        const error = new DrupalHttpError(response.status, response.statusText, url, body);

        if (error.isRetryable && attempt < this.config.retries) {
          const delay = this.config.retryDelay * Math.pow(2, attempt);
          await this.sleep(delay);
          return this.fetchWithRetry<T>(url, init, attempt + 1);
        }

        throw error;
      }

      return await response.json() as T;
    } catch (error) {
      if (error instanceof DrupalHttpError) throw error;

      // Network / abort errors — retry if transient
      if (attempt < this.config.retries) {
        const delay = this.config.retryDelay * Math.pow(2, attempt);
        await this.sleep(delay);
        return this.fetchWithRetry<T>(url, init, attempt + 1);
      }

      throw new DrupalHttpError(0, 'Network error', url, {
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create a DrupalClient from environment variables.
 * Reads: DRUPAL_BASE_URL, DRUPAL_AUTH_TYPE, DRUPAL_USERNAME, DRUPAL_PASSWORD, DRUPAL_TOKEN
 */
export function createClientFromEnv(): DrupalClient {
  const baseUrl = process.env.DRUPAL_BASE_URL || autoDetectDrupalBaseUrl();
  if (!baseUrl) {
    throw new Error(
      'Unable to resolve Drupal base URL. Set DRUPAL_BASE_URL or run from a Lando/DDEV Drupal project directory.',
    );
  }

  let auth: AuthStrategy | undefined;
  const authType = process.env.DRUPAL_AUTH_TYPE ?? 'none';

  switch (authType) {
    case 'basic':
      auth = {
        type: 'basic',
        username: process.env.DRUPAL_USERNAME ?? '',
        password: process.env.DRUPAL_PASSWORD ?? '',
      };
      break;
    case 'bearer':
      auth = {
        type: 'bearer',
        token: process.env.DRUPAL_TOKEN ?? '',
      };
      break;
    case 'api_key':
      auth = {
        type: 'api_key',
        headerName: process.env.DRUPAL_API_KEY_HEADER ?? 'X-API-Key',
        key: process.env.DRUPAL_API_KEY ?? '',
      };
      break;
  }

  return new DrupalClient({
    baseUrl,
    auth,
    timeout: parseInt(process.env.DRUPAL_TIMEOUT ?? '15000', 10),
    retries: parseInt(process.env.DRUPAL_RETRIES ?? '2', 10),
  });
}

function autoDetectDrupalBaseUrl(): string | undefined {
  const root = findProjectRoot(process.cwd());
  if (!root) return undefined;

  const landoConfig = resolve(root, '.lando.yml');
  if (existsSync(landoConfig)) {
    const text = safeReadText(landoConfig);
    const name = parseProjectName(text);
    if (name) return `https://${name}.lndo.site`;
  }

  const ddevConfig = resolve(root, '.ddev', 'config.yaml');
  if (existsSync(ddevConfig)) {
    const text = safeReadText(ddevConfig);
    const name = parseProjectName(text);
    if (name) return `https://${name}.ddev.site`;
  }

  return undefined;
}

function findProjectRoot(startDir: string): string | undefined {
  let dir = resolve(startDir);
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(resolve(dir, '.lando.yml')) || existsSync(resolve(dir, '.ddev', 'config.yaml'))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

function safeReadText(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

function parseProjectName(yamlText: string): string | undefined {
  // Minimal parse for lines like: name: my-project
  const match = yamlText.match(/^\s*name:\s*["']?([A-Za-z0-9_-]+)["']?\s*$/m);
  return match?.[1];
}
