import { z } from 'zod';

// ---------- Server Manifest Schema ----------

export const ServerManifestSchema = z.object({
  /** Machine name matching the server directory. */
  id: z.string(),
  /** SemVer string. */
  version: z.string(),
  /** Human-readable display name. */
  name: z.string().optional(),
  /** One-line description of the server's purpose. */
  description: z.string().optional(),

  /** MCP capability flags. */
  capabilities: z.object({
    tools: z.boolean().default(true),
    resources: z.boolean().default(false),
    prompts: z.boolean().default(false),
  }).default({ tools: true, resources: false, prompts: false }),

  /** Domain of truth this server owns (from the blueprint). */
  domain: z.string(),


  /** Actions this server must never perform (boundary rules). */
  prohibitions: z.array(z.string()).default([]),

  /** Default argument values applied to all tools unless overridden. */
  defaults: z.object({
    verbosity: z.enum(['minimal', 'normal', 'diagnostic', 'raw']).default('minimal'),
    summary_only: z.boolean().default(false),
    include_counts: z.boolean().default(true),
    exclude_noise: z.boolean().default(true),
    limit: z.number().int().min(1).max(1000).default(50),
  }).default({
    verbosity: 'minimal',
    summary_only: false,
    include_counts: true,
    exclude_noise: true,
    limit: 50,
  }),

  /** Source of truth this server primarily uses. */
  source_of_truth: z.enum([
    'runtime', 'config_sync', 'codebase', 'database', 'browser', 'mixed',
  ]).optional(),

  /** Servers this server may cross-reference (for documentation only). */
  related_servers: z.array(z.string()).default([]),
});

export type ServerManifest = z.infer<typeof ServerManifestSchema>;

/**
 * Load and validate a server manifest from a JSON object.
 */
export function parseManifest(raw: unknown): ServerManifest {
  return ServerManifestSchema.parse(raw);
}

/**
 * Load a manifest from a file path (sync, for server startup).
 */
export function loadManifest(manifestPath: string): ServerManifest {
  // Use dynamic require for JSON — fine at startup time.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const raw = require(manifestPath);
  return parseManifest(raw);
}
