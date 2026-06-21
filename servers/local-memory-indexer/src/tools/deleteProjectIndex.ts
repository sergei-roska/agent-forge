import type { ToolDefinition } from '../mcp/runtime.js';
import { ok, err } from '../mcp/envelope.js';
import { ErrorCode } from '../errors/codes.js';
import { deleteProjectIndexInputShape, DeleteProjectIndexInputSchema } from '../contracts/deleteProjectIndex.schema.js';
import { validateProjectPath } from './validatePath.js';
import { projectDataRoot, slugify } from '../storage/paths.js';
import fs from 'node:fs';

export function makeDeleteProjectIndexTool(): ToolDefinition {
  return {
    name: 'delete_project_index',
    description:
      'Delete all index data (SQLite + LanceDB) for project. Use before force re-index on corruption or schema drift.',
    inputSchema: deleteProjectIndexInputShape,

    handler: async (rawArgs) => {
      const parsed = DeleteProjectIndexInputSchema.safeParse(rawArgs);
      if (!parsed.success) {
        return err(ErrorCode.PROJECT_PATH_REQUIRED, parsed.error.issues[0]?.message ?? 'Invalid input.');
      }
      const { project_path } = parsed.data;

      const pathErr = validateProjectPath(project_path);
      if (pathErr) return pathErr;

      const slug = slugify(project_path);
      if (!slug) {
        return err(ErrorCode.PROJECT_PATH_REQUIRED, 'Invalid project path: resolves to empty slug.');
      }

      try {
        const root = projectDataRoot(project_path);
        
        if (fs.existsSync(root)) {
          fs.rmSync(root, { recursive: true, force: true });
          return ok(
            `Successfully deleted project index data at ${root}. You can now start indexing with force=true.`,
            { status: 'deleted', project_path }
          );
        } else {
          return ok(
            `No project index data found at ${root}.`,
            { status: 'not_found', project_path }
          );
        }
      } catch (e) {
        return err('INTERNAL_ERROR', e instanceof Error ? e.message : String(e));
      }
    },
  };
}
