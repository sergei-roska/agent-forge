import { z } from 'zod';
import { buildEnvelope } from '../mcp/envelope.js';
import type { ToolDefinition } from '../mcp/runtime.js';
import { getServerConfig, DEFAULT_EMBED_MODEL } from '../config.js';
import { OllamaClient } from '../services/ollama.js';
import { createProjectDbPath, ProjectStateStore } from '../store/sqlite.js';
import { ProjectVectorStore } from '../store/vectorStore.js';
import { SearchService } from '../search/SearchService.js';
import { runPhase1, IndexProjectArgs } from '../indexing/projectIndex.js';
import { EmbedConsumer } from '../indexing/EmbedConsumer.js';
import { ContextPacker } from '../search/ContextPacker.js';
import { createRunId, nowIso, sha256 } from '../utils.js';
import { resolve, join } from 'node:path';
import { mkdir, rm } from 'node:fs/promises';
import { doctorIndex, healthCheck } from '../health/healthService.js';

const sharedProjectPath = z.string().optional().describe('Absolute or relative project path. Defaults to the server default project.');

function createProjectContext(projectPath?: string) {
  const config = getServerConfig();
  const resolvedProjectPath = resolve(projectPath ?? config.defaultProjectPath);
  const projectHash = sha256(resolvedProjectPath).slice(0, 16);
  const projectDataDir = join(config.dataRoot, projectHash);
  
  const store = new ProjectStateStore(createProjectDbPath(projectDataDir));
  const vectorStore = new ProjectVectorStore(projectDataDir);
  const ollama = new OllamaClient(config.ollamaBaseUrl);
  const search = new SearchService(store, vectorStore, ollama);
  const contextPacker = new ContextPacker(search, store);
  
  // Ensure project path is set in meta
  store.setProjectMeta('project_path', resolvedProjectPath);
  
  return {
    projectPath: resolvedProjectPath,
    projectDataDir,
    store,
    vectorStore,
    ollama,
    search,
    contextPacker
  };
}

export function createLocalVectorSearchTools(): ToolDefinition[] {
  const tools: ToolDefinition[] = [];

  tools.push({
    name: 'start_indexing',
    description: 'Start the Two-Phase indexing process for a project.',
    inputSchema: {
      project_path: sharedProjectPath,
      force: z.boolean().default(false),
      exclude_globs: z.array(z.string()).optional(),
      priority: z.enum(['user_focus', 'recent', 'background']).default('background'),
      background: z.boolean().default(true)
    } as any,
    handler: async (args) => {
      const ctx = createProjectContext(args.project_path as string | undefined);
      try {
        const runId = createRunId('idx');
        
        // Start Phase 1 (Discovery & Parsing)
        const phase1P = runPhase1(ctx.store, {
          projectPath: ctx.projectPath,
          runId,
          force: args.force,
          excludeGlobs: args.exclude_globs,
          priority: args.priority as any
        });

        if (args.background) {
          // Fire and forget Phase 1 + Phase 2
          void (async () => {
            try {
              await phase1P;
              const consumer = new EmbedConsumer(ctx.store, ctx.vectorStore, ctx.ollama);
              await consumer.run(ctx.projectPath, runId);
            } catch (err) {
              console.error('Background indexing failed:', err);
            } finally {
              ctx.store.close();
            }
          })();

          return buildEnvelope({
            summary: 'Indexing started in the background.',
            data: [{ run_id: runId, status: 'running' }],
            source: 'codebase'
          });
        }

        await phase1P;
        const consumer = new EmbedConsumer(ctx.store, ctx.vectorStore, ctx.ollama);
        await consumer.run(ctx.projectPath, runId);

        return buildEnvelope({
          summary: 'Indexing completed synchronously.',
          data: [{ run_id: runId, status: 'completed' }],
          source: 'codebase'
        });
      } finally {
        if (!args.background) ctx.store.close();
      }
    }
  });

  tools.push({
    name: 'get_indexing_status',
    description: 'Check the current status of indexing for a project.',
    inputSchema: {
      project_path: sharedProjectPath,
      run_id: z.string().optional()
    } as any,
    handler: async (args) => {
      const ctx = createProjectContext(args.project_path as string | undefined);
      try {
        let run = null;
        if (args.run_id) {
          run = ctx.store.getRun(args.run_id);
        } else {
          // Get latest run
          // We can add a listRuns method or just a getLatestRun
          // For now, let's just return project stats
        }
        
        const stats = ctx.store.getStats(ctx.projectPath);
        const pendingCount = ctx.store.getPendingChunks(ctx.projectPath, 1000000).length;
        
        return buildEnvelope({
          summary: `Indexing status for ${ctx.projectPath}.`,
          data: [{
            project_path: ctx.projectPath,
            vector_count: stats?.vector_count || 0,
            pending_chunks: pendingCount,
            last_run: run
          }],
          source: 'database'
        });
      } finally {
        ctx.store.close();
      }
    }
  });

  tools.push({
    name: 'search_hybrid',
    description: 'Hybrid search using semantic and keyword ranking with RRF.',
    inputSchema: {
      query: z.string().min(1),
      project_path: sharedProjectPath,
      limit: z.number().int().positive().default(10),
      offset: z.number().int().min(0).default(0),
      alpha: z.number().min(0).max(1).default(0.65)
    } as any,
    handler: async (args) => {
      const ctx = createProjectContext(args.project_path as string | undefined);
      try {
        const result = await ctx.search.searchHybrid(
          String(args.query),
          Number(args.limit || 10),
          Number(args.offset || 0),
          Number(args.alpha || 0.65)
        );
        return buildEnvelope({
          summary: `Hybrid search returned ${result.results.length} result(s).`,
          data: result.results,
          warnings: result.warnings,
          source: 'mixed'
        });
      } finally {
        ctx.store.close();
      }
    }
  });

  tools.push({
    name: 'retrieve_context_pack',
    description: 'Assemble an agent-ready context pack.',
    inputSchema: {
      query: z.string().min(1),
      project_path: sharedProjectPath,
      max_files: z.number().int().positive().default(8),
      max_chars: z.number().int().positive().default(12000),
      include_neighbors: z.boolean().default(true),
      neighbor_hops: z.number().int().min(0).max(3).default(1)
    } as any,
    handler: async (args) => {
      const ctx = createProjectContext(args.project_path as string | undefined);
      try {
        const hybrid = await ctx.search.searchHybrid(String(args.query), 20, 0);
        const pack = await ctx.contextPacker.pack(String(args.query), hybrid.results, {
          maxFiles: Number(args.max_files || 8),
          maxChars: Number(args.max_chars || 12000),
          includeNeighbors: args.include_neighbors !== false,
          neighborHops: Number(args.neighbor_hops || 1)
        });
        return buildEnvelope({
          summary: pack.summary,
          data: [pack],
          source: 'mixed'
        });
      } finally {
        ctx.store.close();
      }
    }
  });

  tools.push({
    name: 'doctor_index',
    description: 'Diagnose and fix index issues.',
    inputSchema: {
      project_path: sharedProjectPath,
      auto_fix: z.boolean().default(false)
    } as any,
    handler: async (args) => {
      const ctx = createProjectContext(args.project_path as string | undefined);
      try {
        const result = await doctorIndex(ctx.store, ctx.vectorStore, !!args.auto_fix);
        return buildEnvelope({
          summary: result.healthy ? 'Index is healthy.' : 'Index has issues.',
          data: [result],
          source: 'database'
        });
      } finally {
        ctx.store.close();
      }
    }
  });

  tools.push({
    name: 'reset_index',
    description: 'Delete and reset the project index.',
    inputSchema: {
      project_path: sharedProjectPath,
      confirm: z.boolean().default(false)
    } as any,
    handler: async (args) => {
      if (!args.confirm) {
        throw new Error('Please confirm the reset with confirm: true');
      }
      const ctx = createProjectContext(args.project_path as string | undefined);
      try {
        await ctx.store.reset(ctx.projectPath);
        await ctx.vectorStore.reset();
        return buildEnvelope({
          summary: 'Project index reset successfully.',
          data: [{ project_path: ctx.projectPath, status: 'reset' }],
          source: 'database'
        });
      } finally {
        ctx.store.close();
      }
    }
  });

  return tools;
}
