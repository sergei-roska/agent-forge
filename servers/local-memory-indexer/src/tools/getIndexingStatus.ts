import type { ToolDefinition } from '../mcp/runtime.js';
import { ok, err } from '../mcp/envelope.js';
import { ErrorCode, IndexerError } from '../errors/codes.js';
import { getIndexingStatusInputShape, GetIndexingStatusInputSchema } from '../contracts/getIndexingStatus.schema.js';
import { validateProjectPath } from './validatePath.js';
import type { RunCoordinator } from '../indexer/RunCoordinator.js';

export function makeGetIndexingStatusTool(coordinator: RunCoordinator): ToolDefinition {
  return {
    name: 'get_indexing_status',
    description:
      'Return detailed progress, ETA, and chunk counts for an indexing run. Omit run_id to get the most recent run for the project.',
    inputSchema: getIndexingStatusInputShape,

    handler: async (rawArgs) => {
      const parsed = GetIndexingStatusInputSchema.safeParse(rawArgs);
      if (!parsed.success) {
        return err(ErrorCode.RUN_NOT_FOUND, parsed.error.issues[0]?.message ?? 'Invalid input.');
      }
      const { run_id, project_path } = parsed.data;

      if (!run_id && project_path) {
        const pathErr = validateProjectPath(project_path);
        if (pathErr) return pathErr;
      }

      if (!run_id && !project_path) {
        return err(ErrorCode.PROJECT_PATH_REQUIRED, 'Provide run_id or project_path.');
      }

      try {
        const status = await coordinator.getStatus(run_id, project_path);

        const { phase, status: runStatus, progress } = status;
        const summary =
          runStatus === 'completed'
            ? `Indexing complete. ${progress.chunks_embedded} chunks embedded across ${progress.files_discovered} files.`
            : runStatus === 'error'
              ? `Indexing error: ${status.error ?? 'unknown'}`
              : runStatus === 'paused'
                ? `Paused at ${progress.percent_complete}% — ${progress.chunks_pending} chunks remaining. Resume with start_indexing.`
                : `${phase} in progress ${progress.progress_bar} ETA: ${progress.eta_seconds < 0 ? '?' : `${progress.eta_seconds}s`}`;

        return ok(summary, status, status.warnings.length ? status.warnings : undefined);
      } catch (e) {
        if (e instanceof IndexerError) return err(e.code, e.message, e.details);
        return err('INTERNAL_ERROR', e instanceof Error ? e.message : String(e));
      }
    },
  };
}
