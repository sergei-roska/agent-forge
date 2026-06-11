import path from 'node:path';
import { ErrorCode } from '../errors/codes.js';
import { err } from '../mcp/envelope.js';
import type { McpResponseEnvelope } from '../mcp/envelope.js';

/**
 * Validates that a project_path is safe to use.
 * Returns an error envelope if invalid, null if valid.
 * Spec: "Must never read or write outside the requested project root."
 */
export function validateProjectPath(projectPath: unknown): McpResponseEnvelope | null {
  if (typeof projectPath !== 'string' || projectPath.trim() === '') {
    return err(ErrorCode.PROJECT_PATH_REQUIRED, 'project_path is required and must be a non-empty string.');
  }

  if (!path.isAbsolute(projectPath)) {
    return err(ErrorCode.PATH_TRAVERSAL, 'project_path must be an absolute path.');
  }

  if (projectPath.includes('\0')) {
    return err(ErrorCode.PATH_TRAVERSAL, 'project_path contains invalid null byte.');
  }

  // path.normalize resolves any .. segments — if result differs, it contained traversal
  const normalized = path.normalize(projectPath);
  if (normalized !== projectPath && normalized !== projectPath.replace(/\/+$/, '')) {
    return err(ErrorCode.PATH_TRAVERSAL, 'project_path contains path traversal sequence.');
  }

  return null;
}
