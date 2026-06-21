import type { ToolDefinition } from '../mcp/runtime.js';
import type { SearchEngine } from '../search/SearchEngine.js';
import { structuredError, ok } from '../mcp/envelope.js';
import { ErrorCode } from '../errors/codes.js';
import {
  findCallersShape, FindCallersSchema,
  findCalleesShape, FindCalleesSchema,
  getImportGraphShape, GetImportGraphSchema,
  tracePathShape, TracePathSchema,
} from '../contracts/schemas.js';
import { validateProject } from './shared.js';

export function makeFindCallersTool(engine: SearchEngine): ToolDefinition {
  return {
    name: 'find_callers',
    description: 'List symbols that call symbol_name (call-graph upstream). Use for "who calls X?". Requires SQLite call graph.',
    inputSchema: findCallersShape,
    handler: async (raw) => {
      const parsed = FindCallersSchema.safeParse(raw);
      if (!parsed.success) return structuredError(ErrorCode.PATH_TRAVERSAL, parsed.error.issues[0]?.message ?? 'Invalid input.');
      const a = parsed.data;
      const proj = validateProject(a.project_path);
      if ('error' in proj) return proj.error;

      const sqlite = engine.sqlite(proj.path);
      if (!sqlite) {
        return structuredError(ErrorCode.INDEX_UNAVAILABLE, 'SQLite state database is missing. Run indexing first.');
      }

      const callers = sqlite.findCallers(proj.path, a.symbol_name, a.depth);
      return ok(
        `Found ${callers.length} caller(s) for symbol '${a.symbol_name}' at depth ${a.depth}.`,
        { callers }
      );
    },
  };
}

export function makeFindCalleesTool(engine: SearchEngine): ToolDefinition {
  return {
    name: 'find_callees',
    description: 'List symbols called by symbol_name (call-graph downstream). Use for "what does X call?". Requires SQLite call graph.',
    inputSchema: findCalleesShape,
    handler: async (raw) => {
      const parsed = FindCalleesSchema.safeParse(raw);
      if (!parsed.success) return structuredError(ErrorCode.PATH_TRAVERSAL, parsed.error.issues[0]?.message ?? 'Invalid input.');
      const a = parsed.data;
      const proj = validateProject(a.project_path);
      if ('error' in proj) return proj.error;

      const sqlite = engine.sqlite(proj.path);
      if (!sqlite) {
        return structuredError(ErrorCode.INDEX_UNAVAILABLE, 'SQLite state database is missing. Run indexing first.');
      }

      const callees = sqlite.findCallees(proj.path, a.symbol_name, a.depth);
      return ok(
        `Found ${callees.length} callee(s) called by symbol '${a.symbol_name}' at depth ${a.depth}.`,
        { callees }
      );
    },
  };
}

export function makeGetImportGraphTool(engine: SearchEngine): ToolDefinition {
  return {
    name: 'get_import_graph',
    description: 'List import/dependency edges. Omit file_path for project-wide graph; set file_path for one file.',
    inputSchema: getImportGraphShape,
    handler: async (raw) => {
      const parsed = GetImportGraphSchema.safeParse(raw);
      if (!parsed.success) return structuredError(ErrorCode.PATH_TRAVERSAL, parsed.error.issues[0]?.message ?? 'Invalid input.');
      const a = parsed.data;
      const proj = validateProject(a.project_path);
      if ('error' in proj) return proj.error;

      const sqlite = engine.sqlite(proj.path);
      if (!sqlite) {
        return structuredError(ErrorCode.INDEX_UNAVAILABLE, 'SQLite state database is missing. Run indexing first.');
      }

      const imports = sqlite.getImportGraph(proj.path, a.file_path);
      return ok(
        `Found ${imports.length} import relationship(s).`,
        { imports }
      );
    },
  };
}

export function makeTracePathTool(engine: SearchEngine): ToolDefinition {
  return {
    name: 'trace_path',
    description: 'Find call chain from source_symbol to target_symbol. Use for execution-flow / call-path questions.',
    inputSchema: tracePathShape,
    handler: async (raw) => {
      const parsed = TracePathSchema.safeParse(raw);
      if (!parsed.success) return structuredError(ErrorCode.PATH_TRAVERSAL, parsed.error.issues[0]?.message ?? 'Invalid input.');
      const a = parsed.data;
      const proj = validateProject(a.project_path);
      if ('error' in proj) return proj.error;

      const sqlite = engine.sqlite(proj.path);
      if (!sqlite) {
        return structuredError(ErrorCode.INDEX_UNAVAILABLE, 'SQLite state database is missing. Run indexing first.');
      }

      const pathChain = sqlite.tracePath(proj.path, a.source_symbol, a.target_symbol);
      const summary = pathChain.length > 0
        ? `Found execution path of length ${pathChain.length - 1} between '${a.source_symbol}' and '${a.target_symbol}'.`
        : `No execution path found between '${a.source_symbol}' and '${a.target_symbol}'.`;
      return ok(summary, { path: pathChain });
    },
  };
}
