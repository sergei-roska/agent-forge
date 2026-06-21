import { z } from 'zod';

export const resumeIndexingInputShape = {
  run_id: z.string().describe('Paused run_id from pause_indexing.'),
  project_path: z
    .string()
    .optional()
    .describe('Absolute project root; required after server restart if run not in memory.'),
} as const;

export const ResumeIndexingInputSchema = z.object(resumeIndexingInputShape);
export type ResumeIndexingInput = z.infer<typeof ResumeIndexingInputSchema>;

export interface ResumeIndexingOutput {
  run_id: string;
  status: 'resumed' | 'not_paused' | 'already_running';
  project_path: string;
  chunks_remaining: number;
  message: string;
}

export const RESUME_INDEXING_JSON_SCHEMA = {
  type: 'object',
  required: ['run_id'],
  properties: {
    run_id:       { type: 'string', description: 'Paused run_id from pause_indexing.' },
    project_path: { type: 'string', description: 'Absolute project root; required after server restart if run not in memory.' },
  },
} as const;
