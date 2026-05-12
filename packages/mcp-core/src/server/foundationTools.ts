import { z } from 'zod';
import type { ToolDefinition } from './createServer.js';
import type { ServerManifest } from './manifest.js';
import { buildEnvelope } from '../contracts/response.js';

/**
 * Returns the foundation tools that every MCP server must expose.
 * These provide self-description and introspection for agents.
 */
export function getFoundationTools(
  manifest: ServerManifest,
  domainTools: ToolDefinition[],
): ToolDefinition[] {
  return [
    // ---- health_check ----
    {
      name: 'health_check',
      description: 'Return server metadata, version, tool count, and transport readiness.',
      inputSchema: {},
      handler: async () => buildEnvelope({
        summary: `${manifest.id} v${manifest.version} is ready.`,
        data: [{
          id: manifest.id,
          name: manifest.name ?? manifest.id,
          version: manifest.version,
          domain: manifest.domain,
          source_of_truth: manifest.source_of_truth ?? 'unknown',
          tool_count: domainTools.length + 4, // domain tools + 4 foundation tools
          status: 'ready',
          timestamp: new Date().toISOString(),
        }],
        source: 'runtime',
      }),
    },

    // ---- describe_server_contract ----
    {
      name: 'describe_server_contract',
      description: 'Return server domain, prohibitions, default settings, and boundary rules.',
      inputSchema: {},
      handler: async () => buildEnvelope({
        summary: `Contract for ${manifest.id}: ${manifest.domain}`,
        data: [{
          domain: manifest.domain,
          description: manifest.description ?? '',
          source_of_truth: manifest.source_of_truth ?? 'unknown',
          prohibitions: manifest.prohibitions,
          defaults: manifest.defaults,
          related_servers: manifest.related_servers,
        }],
        source: 'runtime',
      }),
    },

    // ---- list_server_tools ----
    {
      name: 'list_server_tools',
      description: 'Return compact metadata for every tool registered on this server.',
      inputSchema: {},
      handler: async () => {
        const allTools = [...domainTools];
        const toolMeta = allTools.map((t) => ({
          name: t.name,
          description: t.description,
        }));

        // Also add foundation tools themselves
        const foundationMeta = [
          { name: 'health_check', description: 'Return server metadata, version, tool count, and transport readiness.' },
          { name: 'describe_server_contract', description: 'Return server domain, prohibitions, default settings, and boundary rules.' },
          { name: 'list_server_tools', description: 'Return compact metadata for every tool registered on this server.' },
          { name: 'explain_response_controls', description: 'Explain supported projection, truncation, windowing, and verbosity controls.' },
        ];

        return buildEnvelope({
          summary: `${manifest.id} exposes ${toolMeta.length + foundationMeta.length} tools.`,
          data: [...foundationMeta, ...toolMeta],
          total: toolMeta.length + foundationMeta.length,
          source: 'runtime',
        });
      },
    },

    // ---- explain_response_controls ----
    {
      name: 'explain_response_controls',
      description: 'Explain supported projection, truncation, windowing, and verbosity controls for this server.',
      inputSchema: {},
      handler: async () => buildEnvelope({
        summary: 'Response control reference for agent callers.',
        data: [{
          verbosity: {
            levels: ['minimal', 'normal', 'diagnostic', 'raw'],
            default: manifest.defaults.verbosity,
            description: 'Controls response detail level. Use "minimal" (default) for discovery, "diagnostic" or "raw" for debugging.',
          },
          pagination: {
            args: ['limit', 'cursor', 'offset', 'sort', 'sort_direction'],
            default_limit: manifest.defaults.limit,
            description: 'All list tools support cursor or offset pagination.',
          },
          projection: {
            args: ['fields', 'exclude_fields', 'expand'],
            description: 'Include or exclude specific fields. Use "expand" to inline nested references.',
          },
          windowing: {
            args: ['max_chars', 'start_char', 'end_char', 'truncate_strategy'],
            strategies: ['head', 'middle', 'tail'],
            default_max_chars: 10_000,
            description: 'Bound large text payloads. Response includes window metadata when truncated.',
          },
          noise_control: {
            args: ['summary_only', 'include_counts', 'exclude_noise'],
            description: 'Suppress Drupal metadata noise. "summary_only" returns only the summary string.',
          },
        }],
        source: 'runtime',
      }),
    },
  ];
}
