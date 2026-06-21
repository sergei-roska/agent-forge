import { z } from 'zod';

export const doctorIndexInputShape = {
  project_path: z.string().describe('Absolute project root path.'),
  auto_fix: z
    .boolean()
    .default(false)
    .describe('Auto-repair safe issues: schema drift, stale chunks, FTS, queue errors.'),
} as const;

export const DoctorIndexInputSchema = z.object(doctorIndexInputShape);
export type DoctorIndexInput = z.infer<typeof DoctorIndexInputSchema>;

export const DOCTOR_INDEX_JSON_SCHEMA = {
  type: 'object',
  required: ['project_path'],
  properties: {
    project_path: { type: 'string', description: 'Absolute project root path.' },
    auto_fix:     { type: 'boolean', default: false, description: 'Auto-repair safe issues: schema drift, stale chunks, FTS, queue errors.' },
  },
} as const;
