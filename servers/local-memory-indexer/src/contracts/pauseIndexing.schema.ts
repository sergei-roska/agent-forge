import { z } from 'zod';

export const pauseIndexingInputShape = {
  run_id: z.string().describe('The run_id returned by start_indexing.'),
} as const;

export const PauseIndexingInputSchema = z.object(pauseIndexingInputShape);
export type PauseIndexingInput = z.infer<typeof PauseIndexingInputSchema>;

export interface PauseIndexingOutput {
  run_id: string;
  status: 'paused' | 'already_paused' | 'not_found';
  chunks_embedded_so_far: number;
  chunks_remaining: number;
  message: string;
}

/** Plain JSON Schema for §4.2. */
export const PAUSE_INDEXING_JSON_SCHEMA = {
  type: 'object',
  required: ['run_id'],
  properties: {
    run_id: { type: 'string', description: 'The run_id returned by start_indexing.' },
  },
} as const;
