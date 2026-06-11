import { z } from 'zod';

export const resumeIndexingInputShape = {
  run_id: z.string().describe('The run_id of a paused indexing run.'),
  project_path: z
    .string()
    .optional()
    .describe('Project path if run_id is not in the active session (recommended after restart).'),
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
    run_id:       { type: 'string', description: 'The run_id of a paused indexing run.' },
    project_path: { type: 'string', description: 'Project path when resuming after process restart.' },
  },
} as const;
