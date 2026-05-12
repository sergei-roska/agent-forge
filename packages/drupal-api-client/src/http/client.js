/**
 * Drupal HTTP client with retry, timeout, and structured error handling.
 *
 * This client is the shared access layer for all Drupal API calls.
 * It normalizes errors into McpError instances and supports configurable retry.
 */
import { authHeaders } from '../auth.js';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
// ---------- Error Types ----------
export class DrupalHttpError extends Error {
    status;
    statusText;
    url;
    body;
    constructor(status, statusText, url, body) {
        super(`HTTP ${status} ${statusText} from ${url}`);
        this.status = status;
        this.statusText = statusText;
        this.url = url;
        this.body = body;
        this.name = 'DrupalHttpError';
    }
    get isRetryable() {
        return this.status >= 500 || this.status === 429;
    }
    get isNotFound() {
        return this.status === 404;
    }
    get isUnauthorized() {
        return this.status === 401 || this.status === 403;
    }
}
// ---------- Client ----------
export class DrupalClient {
    config;
    constructor(config) {
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
    async get(path, params) {
        const url = this.buildUrl(path, params);
        return this.fetchWithRetry(url, { method: 'GET' });
    }
    /**
     * POST request with automatic retry and error normalization.
     */
    async post(path, body) {
        const url = this.buildUrl(path);
        return this.fetchWithRetry(url, {
            method: 'POST',
            body: body ? JSON.stringify(body) : undefined,
            headers: { 'Content-Type': 'application/json' },
        });
    }
    /**
     * Fetch JSON:API index document from /jsonapi.
     * This is the canonical API-only discovery entrypoint in Drupal 10/11.
     */
    async getJsonApiIndex() {
        return this.get('/jsonapi');
    }
    /**
     * List available JSON:API resource collection keys.
     * Keys usually look like "node--article", "user--user", etc.
     */
    async listJsonApiResourceTypes() {
        const index = await this.getJsonApiIndex();
        return Object.keys(index.links ?? {}).filter((k) => k.includes('--'));
    }
    /**
     * Fetch a JSON:API collection by resource type key (e.g. node--article).
     */
    async getJsonApiCollection(resourceType, params) {
        const normalized = resourceType.replace(/--/g, '/');
        return this.get(`/jsonapi/${normalized}`, params);
    }
    /**
     * Build a full URL from a path and optional query params.
     */
    buildUrl(path, params) {
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
    async fetchWithRetry(url, init, attempt = 0) {
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
                let body;
                try {
                    body = await response.json();
                }
                catch {
                    body = await response.text().catch(() => null);
                }
                const error = new DrupalHttpError(response.status, response.statusText, url, body);
                if (error.isRetryable && attempt < this.config.retries) {
                    const delay = this.config.retryDelay * Math.pow(2, attempt);
                    await this.sleep(delay);
                    return this.fetchWithRetry(url, init, attempt + 1);
                }
                throw error;
            }
            return await response.json();
        }
        catch (error) {
            if (error instanceof DrupalHttpError)
                throw error;
            // Network / abort errors — retry if transient
            if (attempt < this.config.retries) {
                const delay = this.config.retryDelay * Math.pow(2, attempt);
                await this.sleep(delay);
                return this.fetchWithRetry(url, init, attempt + 1);
            }
            throw new DrupalHttpError(0, 'Network error', url, {
                message: error instanceof Error ? error.message : String(error),
            });
        }
        finally {
            clearTimeout(timeoutId);
        }
    }
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
/**
 * Create a DrupalClient from environment variables.
 * Reads: DRUPAL_BASE_URL, DRUPAL_AUTH_TYPE, DRUPAL_USERNAME, DRUPAL_PASSWORD, DRUPAL_TOKEN
 */
export function createClientFromEnv() {
    const baseUrl = process.env.DRUPAL_BASE_URL || autoDetectDrupalBaseUrl();
    if (!baseUrl) {
        throw new Error('Unable to resolve Drupal base URL. Set DRUPAL_BASE_URL or run from a Lando/DDEV Drupal project directory.');
    }
    let auth;
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
function autoDetectDrupalBaseUrl() {
    const root = findProjectRoot(process.cwd());
    if (!root)
        return undefined;
    const landoConfig = resolve(root, '.lando.yml');
    if (existsSync(landoConfig)) {
        const text = safeReadText(landoConfig);
        const name = parseProjectName(text);
        if (name)
            return `https://${name}.lndo.site`;
    }
    const ddevConfig = resolve(root, '.ddev', 'config.yaml');
    if (existsSync(ddevConfig)) {
        const text = safeReadText(ddevConfig);
        const name = parseProjectName(text);
        if (name)
            return `https://${name}.ddev.site`;
    }
    return undefined;
}
function findProjectRoot(startDir) {
    let dir = resolve(startDir);
    for (let i = 0; i < 8; i += 1) {
        if (existsSync(resolve(dir, '.lando.yml')) || existsSync(resolve(dir, '.ddev', 'config.yaml'))) {
            return dir;
        }
        const parent = dirname(dir);
        if (parent === dir)
            break;
        dir = parent;
    }
    return undefined;
}
function safeReadText(path) {
    try {
        return readFileSync(path, 'utf8');
    }
    catch {
        return '';
    }
}
function parseProjectName(yamlText) {
    // Minimal parse for lines like: name: my-project
    const match = yamlText.match(/^\s*name:\s*["']?([A-Za-z0-9_-]+)["']?\s*$/m);
    return match?.[1];
}
