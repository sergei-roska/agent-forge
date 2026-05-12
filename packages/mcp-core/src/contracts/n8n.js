"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkflowMetadataSchema = exports.WorkflowResponseSchema = exports.WorkflowExecutionStatusSchema = exports.WorkflowListArgsSchema = exports.WorkflowStatusArgsSchema = exports.WorkflowTriggerArgsSchema = exports.WorkflowTriggerArgsObject = void 0;
const zod_1 = require("zod");
const base_js_1 = require("./base.js");
// ---------- Workflow Trigger ----------
exports.WorkflowTriggerArgsObject = zod_1.z.object({
    workflow_id: zod_1.z.string().optional()
        .describe('The ID or Slug of the n8n workflow to trigger (use for API triggers).'),
    webhook_path: zod_1.z.string().optional()
        .describe('The custom path of the n8n Webhook node (use for direct webhook triggers).'),
    payload: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional()
        .describe('Input data for the workflow.'),
    sync: zod_1.z.boolean().default(false)
        .describe('If true, waits for workflow completion (only for short-running tasks).'),
    priority: zod_1.z.enum(['high', 'normal', 'low']).default('normal')
        .describe('Execution priority for the workflow.'),
});
exports.WorkflowTriggerArgsSchema = exports.WorkflowTriggerArgsObject.refine(data => data.workflow_id || data.webhook_path, {
    message: "Either workflow_id or webhook_path must be provided",
    path: ["workflow_id"]
});
// ---------- Workflow Status ----------
exports.WorkflowStatusArgsSchema = zod_1.z.object({
    execution_id: zod_1.z.string()
        .describe('The unique identifier for the workflow execution (returned by trigger).'),
});
// ---------- Workflow List ----------
exports.WorkflowListArgsSchema = base_js_1.SharedArgsSchema.extend({
    tags: zod_1.z.array(zod_1.z.string()).optional()
        .describe('Filter workflows by tags (e.g., ["agent-forge-safe"]).'),
});
// ---------- Response Types ----------
exports.WorkflowExecutionStatusSchema = zod_1.z.enum([
    'started',
    'queued',
    'running',
    'success',
    'failed',
    'waiting_for_input',
    'canceled',
]);
exports.WorkflowResponseSchema = zod_1.z.object({
    execution_id: zod_1.z.string(),
    status: exports.WorkflowExecutionStatusSchema,
    progress: zod_1.z.number().min(0).max(100).optional(),
    last_node: zod_1.z.string().optional(),
    output: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
    error: zod_1.z.string().optional(),
});
exports.WorkflowMetadataSchema = zod_1.z.object({
    id: zod_1.z.string(),
    name: zod_1.z.string(),
    description: zod_1.z.string().optional(),
    active: zod_1.z.boolean(),
    tags: zod_1.z.array(zod_1.z.string()).default([]),
    input_schema: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
