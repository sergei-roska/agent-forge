import type { ToolDefinition } from '../mcp/runtime.js';
import { ok, err } from '../mcp/envelope.js';
import { ErrorCode, IndexerError } from '../errors/codes.js';
import { pauseIndexingInputShape, PauseIndexingInputSchema } from '../contracts/pauseIndexing.schema.js';
import type { RunCoordinator } from '../indexer/RunCoordinator.js';

export function makePauseIndexingTool(coordinator: RunCoordinator): ToolDefinition {
  return {
    name: 'pause_indexing',
    description:
      'Gracefully pause an active Phase 2 embedding run. The current batch completes before pausing. State is checkpointed in SQLite for resumption via start_indexing.',
    inputSchema: pauseIndexingInputShape,

    handler: async (rawArgs) => {
      const parsed = PauseIndexingInputSchema.safeParse(rawArgs);
      if (!parsed.success) {
        return err(ErrorCode.RUN_NOT_FOUND, parsed.error.issues[0]?.message ?? 'Invalid input.');
      }
      const { run_id } = parsed.data;

      try {
        const result = coordinator.pause(run_id);

        if (result.status === 'not_found') {
          return err(ErrorCode.RUN_NOT_FOUND, result.message, { run_id });
        }

        const summary =
          result.status === 'already_paused'
            ? `Run "${run_id}" is already paused.`
            : `Pause requested for run "${run_id}". Current batch will complete first. ${result.chunks_embedded_so_far} embedded, ${result.chunks_remaining} remaining.`;

        return ok(summary, result);
      } catch (e) {
        if (e instanceof IndexerError) return err(e.code, e.message, e.details);
        return err('INTERNAL_ERROR', e instanceof Error ? e.message : String(e));
      }
    },
  };
}
