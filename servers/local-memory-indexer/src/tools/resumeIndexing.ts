import type { ToolDefinition } from '../mcp/runtime.js';
import { ok, err } from '../mcp/envelope.js';
import { ErrorCode, IndexerError } from '../errors/codes.js';
import { resumeIndexingInputShape, ResumeIndexingInputSchema } from '../contracts/resumeIndexing.schema.js';
import { validateProjectPath } from './validatePath.js';
import type { RunCoordinator } from '../indexer/RunCoordinator.js';

export function makeResumeIndexingTool(coordinator: RunCoordinator): ToolDefinition {
  return {
    name: 'resume_indexing',
    description:
      'Resume a paused Phase 2 embedding run. Equivalent to start_indexing with phases: [embedding] on the same project.',
    inputSchema: resumeIndexingInputShape,

    handler: async (rawArgs) => {
      const parsed = ResumeIndexingInputSchema.safeParse(rawArgs);
      if (!parsed.success) {
        return err(ErrorCode.RUN_NOT_FOUND, parsed.error.issues[0]?.message ?? 'Invalid input.');
      }
      const { run_id, project_path } = parsed.data;

      if (project_path) {
        const pathErr = validateProjectPath(project_path);
        if (pathErr) return pathErr;
      }

      try {
        const result = await coordinator.resume(run_id, project_path);

        if (result.status === 'not_paused') {
          return ok(result.message, result);
        }

        if (result.status === 'already_running') {
          return ok(result.message, result);
        }

        return ok(
          `Embedding resumed for "${result.project_path}" — ${result.chunks_remaining} chunks pending (run_id: ${result.run_id}).`,
          result,
        );
      } catch (e) {
        if (e instanceof IndexerError) return err(e.code, e.message, e.details);
        return err('INTERNAL_ERROR', e instanceof Error ? e.message : String(e));
      }
    },
  };
}
