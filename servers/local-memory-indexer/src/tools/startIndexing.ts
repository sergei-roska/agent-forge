import type { ToolDefinition } from '../mcp/runtime.js';
import { ok, err } from '../mcp/envelope.js';
import { ErrorCode, IndexerError } from '../errors/codes.js';
import { startIndexingInputShape, StartIndexingInputSchema } from '../contracts/startIndexing.schema.js';
import { validateProjectPath } from './validatePath.js';
import type { RunCoordinator } from '../indexer/RunCoordinator.js';

export function makeStartIndexingTool(coordinator: RunCoordinator): ToolDefinition {
  return {
    name: 'start_indexing',
    description:
      'Start async indexing: discovery (scan/chunk → SQLite), embedding (vectors → LanceDB). Returns run_id; poll get_indexing_status.',
    inputSchema: startIndexingInputShape,

    handler: async (rawArgs) => {
      const parsed = StartIndexingInputSchema.safeParse(rawArgs);
      if (!parsed.success) {
        return err(ErrorCode.PROJECT_PATH_REQUIRED, parsed.error.issues[0]?.message ?? 'Invalid input.');
      }
      const args = parsed.data;

      const pathErr = validateProjectPath(args.project_path);
      if (pathErr) return pathErr;

      try {
        const result = await coordinator.start(args);

        if (result.status === 'already_running') {
          return ok(
            `Indexing already running for "${args.project_path}" (run_id: ${result.run_id}, age: ${result.lock_age_seconds}s).`,
            result,
          );
        }

        return ok(
          `Indexing started for "${args.project_path}" — phases: [${result.phases.join(', ')}]. Poll with get_indexing_status(run_id: "${result.run_id}").`,
          result,
        );
      } catch (e) {
        if (e instanceof IndexerError) return err(e.code, e.message, e.details);
        return err('INTERNAL_ERROR', e instanceof Error ? e.message : String(e));
      }
    },
  };
}
