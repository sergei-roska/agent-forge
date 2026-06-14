import { z } from 'zod';

export const deleteProjectIndexInputShape = {
  project_path: z.string().describe('Absolute path to the project to delete the index for.'),
} as const;

export const DeleteProjectIndexInputSchema = z.object(deleteProjectIndexInputShape);
export type DeleteProjectIndexInput = z.infer<typeof DeleteProjectIndexInputSchema>;

export const DELETE_PROJECT_INDEX_JSON_SCHEMA = {
  type: 'object',
  required: ['project_path'],
  properties: {
    project_path: { type: 'string' },
  },
} as const;
