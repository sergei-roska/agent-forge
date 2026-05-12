// ---- Contracts ----
export {
  VerbositySchema,
  PaginationArgsSchema,
  FilterArgsSchema,
  ProjectionArgsSchema,
  NoiseControlArgsSchema,
  WindowingArgsSchema,
  SharedArgsSchema,
} from './contracts/base.js';
export type {
  Verbosity,
  PaginationArgs,
  FilterArgs,
  ProjectionArgs,
  NoiseControlArgs,
  WindowingArgs,
  SharedArgs,
} from './contracts/base.js';

export {
  PaginationMetaSchema,
  WindowMetaSchema,
  NoiseControlMetaSchema,
  SourceOfTruthSchema,
  McpResponseEnvelopeSchema,
  buildEnvelope,
  applyWindowing,
  applyProjection,
} from './contracts/response.js';
export type {
  PaginationMeta,
  WindowMeta,
  NoiseControlMeta,
  SourceOfTruth,
  McpResponseEnvelope,
  EnvelopeOptions,
} from './contracts/response.js';

// ---- n8n Contracts ----
export {
  WorkflowTriggerArgsObject,
  WorkflowTriggerArgsSchema,
  WorkflowStatusArgsSchema,
  WorkflowListArgsSchema,
  WorkflowExecutionStatusSchema,
  WorkflowResponseSchema,
  WorkflowMetadataSchema,
} from './contracts/n8n.js';
export type {
  WorkflowTriggerArgs,
  WorkflowStatusArgs,
  WorkflowListArgs,
  WorkflowExecutionStatus,
  WorkflowResponse,
  WorkflowMetadata,
} from './contracts/n8n.js';

// ---- Errors ----
export {
  McpErrorCode,
  McpError,
  validationError,
  notFoundError,
  domainViolation,
  unsupportedDomain,
  drupalApiError,
} from './errors.js';

// ---- Server ----
export {
  createMcpServer,
  startServer,
} from './server/createServer.js';
export type {
  ToolDefinition,
  CreateServerOptions,
} from './server/createServer.js';

export {
  ServerManifestSchema,
  parseManifest,
  loadManifest,
} from './server/manifest.js';
export type { ServerManifest } from './server/manifest.js';

export { getFoundationTools } from './server/foundationTools.js';
