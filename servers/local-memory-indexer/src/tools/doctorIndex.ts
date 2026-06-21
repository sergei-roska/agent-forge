import type { ToolDefinition } from '../mcp/runtime.js';
import { ok, err } from '../mcp/envelope.js';
import { ErrorCode, IndexerError } from '../errors/codes.js';
import { doctorIndexInputShape, DoctorIndexInputSchema } from '../contracts/doctorIndex.schema.js';
import { validateProjectPath } from './validatePath.js';
import { openDb } from '../storage/sqlite.js';
import { IndexerDoctor } from '../health/doctor.js';

export function makeDoctorIndexTool(): ToolDefinition {
  return {
    name: 'doctor_index',
    description:
      'Diagnose SQLite/LanceDB/FTS/fingerprint consistency. auto_fix repairs safe issues; run start_indexing if chunks marked pending.',
    inputSchema: doctorIndexInputShape,

    handler: async (rawArgs) => {
      const parsed = DoctorIndexInputSchema.safeParse(rawArgs);
      if (!parsed.success) {
        return err(ErrorCode.PROJECT_PATH_REQUIRED, parsed.error.issues[0]?.message ?? 'Invalid input.');
      }
      const { project_path, auto_fix } = parsed.data;

      const pathErr = validateProjectPath(project_path);
      if (pathErr) return pathErr;

      const db = openDb(project_path);
      try {
        const doctor = new IndexerDoctor(db);
        const result = await doctor.run(project_path, auto_fix);

        const summary = result.healthy
          ? `Index healthy for "${project_path}" (${result.checks.length} checks passed).`
          : result.auto_fixed.length > 0
            ? `Fixed ${result.auto_fixed.length} issue(s); ${result.issues.length} remaining for "${project_path}".`
            : `${result.issues.length} issue(s) found for "${project_path}".`;

        return ok(summary, result, result.suggested_actions.length ? result.suggested_actions : undefined);
      } catch (e) {
        if (e instanceof IndexerError) return err(e.code, e.message, e.details);
        return err('INTERNAL_ERROR', e instanceof Error ? e.message : String(e));
      } finally {
        db.close();
      }
    },
  };
}
