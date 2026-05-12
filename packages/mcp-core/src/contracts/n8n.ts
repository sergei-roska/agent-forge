import { z } from 'zod';
import { SharedArgsSchema } from './base.js';

// ---------- Workflow Trigger ----------
export const WorkflowTriggerArgsObject = z.object({
  workflow_id: z.string().optional()
    .describe('The ID or Slug of the n8n workflow to trigger (use for API triggers).'),
  webhook_path: z.string().optional()
    .describe('The custom path of the n8n Webhook node (use for direct webhook triggers).'),
  payload: z.record(z.string(), z.unknown()).optional()
    .describe('Input data for the workflow.'),
  sync: z.boolean().default(false)
    .describe('If true, waits for workflow completion (only for short-running tasks).'),
  priority: z.enum(['high', 'normal', 'low']).default('normal')
    .describe('Execution priority for the workflow.'),
});

export const WorkflowTriggerArgsSchema = WorkflowTriggerArgsObject.refine(data => data.workflow_id || data.webhook_path, {
  message: "Either workflow_id or webhook_path must be provided",
  path: ["workflow_id"]
});
export type WorkflowTriggerArgs = z.infer<typeof WorkflowTriggerArgsSchema>;

// ---------- Workflow Status ----------
export const WorkflowStatusArgsSchema = z.object({
  execution_id: z.string()
    .describe('The unique identifier for the workflow execution (returned by trigger).'),
});
export type WorkflowStatusArgs = z.infer<typeof WorkflowStatusArgsSchema>;

// ---------- Workflow List ----------
export const WorkflowListArgsSchema = SharedArgsSchema.extend({
  tags: z.array(z.string()).optional()
    .describe('Filter workflows by tags (e.g., ["agent-forge-safe"]).'),
});
export type WorkflowListArgs = z.infer<typeof WorkflowListArgsSchema>;

// ---------- Response Types ----------

export const WorkflowExecutionStatusSchema = z.enum([
  'started',
  'queued',
  'running',
  'success',
  'failed',
  'waiting_for_input',
  'canceled',
]);
export type WorkflowExecutionStatus = z.infer<typeof WorkflowExecutionStatusSchema>;

export const WorkflowResponseSchema = z.object({
  execution_id: z.string(),
  status: WorkflowExecutionStatusSchema,
  progress: z.number().min(0).max(100).optional(),
  last_node: z.string().optional(),
  output: z.record(z.string(), z.unknown()).optional(),
  error: z.string().optional(),
});
export type WorkflowResponse = z.infer<typeof WorkflowResponseSchema>;

export const WorkflowMetadataSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  active: z.boolean(),
  tags: z.array(z.string()).default([]),
  input_schema: z.record(z.string(), z.unknown()).optional(),
});
export type WorkflowMetadata = z.infer<typeof WorkflowMetadataSchema>;
