import { z } from 'zod';

export const doctorIndexInputShape = {
  project_path: z.string().describe('Absolute path to the project root.'),
  auto_fix: z
    .boolean()
    .default(false)
    .describe('Attempt automatic repairs for safe issues (schema_version, stale chunks, FTS, queue errors).'),
} as const;

export const DoctorIndexInputSchema = z.object(doctorIndexInputShape);
export type DoctorIndexInput = z.infer<typeof DoctorIndexInputSchema>;

export const DOCTOR_INDEX_JSON_SCHEMA = {
  type: 'object',
  required: ['project_path'],
  properties: {
    project_path: { type: 'string' },
    auto_fix:     { type: 'boolean', default: false },
  },
} as const;
