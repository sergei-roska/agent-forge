"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServerManifestSchema = void 0;
exports.parseManifest = parseManifest;
exports.loadManifest = loadManifest;
const zod_1 = require("zod");
// ---------- Server Manifest Schema ----------
exports.ServerManifestSchema = zod_1.z.object({
    /** Machine name matching the server directory. */
    id: zod_1.z.string(),
    /** SemVer string. */
    version: zod_1.z.string(),
    /** Human-readable display name. */
    name: zod_1.z.string().optional(),
    /** One-line description of the server's purpose. */
    description: zod_1.z.string().optional(),
    /** MCP capability flags. */
    capabilities: zod_1.z.object({
        tools: zod_1.z.boolean().default(true),
        resources: zod_1.z.boolean().default(false),
        prompts: zod_1.z.boolean().default(false),
    }).default({ tools: true, resources: false, prompts: false }),
    /** Domain of truth this server owns (from the blueprint). */
    domain: zod_1.z.string(),
    /** Actions this server must never perform (boundary rules). */
    prohibitions: zod_1.z.array(zod_1.z.string()).default([]),
    /** Default argument values applied to all tools unless overridden. */
    defaults: zod_1.z.object({
        verbosity: zod_1.z.enum(['minimal', 'normal', 'diagnostic', 'raw']).default('minimal'),
        summary_only: zod_1.z.boolean().default(false),
        include_counts: zod_1.z.boolean().default(true),
        exclude_noise: zod_1.z.boolean().default(true),
        limit: zod_1.z.number().int().min(1).max(1000).default(50),
    }).default({}),
    /** Source of truth this server primarily uses. */
    source_of_truth: zod_1.z.enum([
        'runtime', 'config_sync', 'codebase', 'database', 'browser', 'mixed',
    ]).optional(),
    /** Servers this server may cross-reference (for documentation only). */
    related_servers: zod_1.z.array(zod_1.z.string()).default([]),
});
/**
 * Load and validate a server manifest from a JSON object.
 */
function parseManifest(raw) {
    return exports.ServerManifestSchema.parse(raw);
}
/**
 * Load a manifest from a file path (sync, for server startup).
 */
function loadManifest(manifestPath) {
    // Use dynamic require for JSON — fine at startup time.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const raw = require(manifestPath);
    return parseManifest(raw);
}
