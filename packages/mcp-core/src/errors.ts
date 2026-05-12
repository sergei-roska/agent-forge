export enum McpErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  TIMEOUT = 'TIMEOUT',
  RATE_LIMITED = 'RATE_LIMITED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  DOMAIN_VIOLATION = 'DOMAIN_VIOLATION',
  TRUNCATED_RESPONSE = 'TRUNCATED_RESPONSE',
  UNSUPPORTED_DOMAIN = 'UNSUPPORTED_DOMAIN',
  DRUPAL_API_ERROR = 'DRUPAL_API_ERROR',
}

export class McpError extends Error {
  public readonly code: McpErrorCode;
  public readonly details?: unknown;
  public readonly recoverable: boolean;

  constructor(
    code: McpErrorCode,
    message: string,
    options?: { details?: unknown; recoverable?: boolean },
  ) {
    super(message);
    this.name = 'McpError';
    this.code = code;
    this.details = options?.details;
    this.recoverable = options?.recoverable ?? false;
  }

  /**
   * Serialize to a structured object suitable for MCP error responses.
   */
  toJSON() {
    return {
      error: this.code,
      message: this.message,
      recoverable: this.recoverable,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

// ---------- Convenience Factories ----------

export function validationError(message: string, details?: unknown): McpError {
  return new McpError(McpErrorCode.VALIDATION_ERROR, message, { details, recoverable: true });
}

export function notFoundError(resource: string, id: string): McpError {
  return new McpError(McpErrorCode.NOT_FOUND, `${resource} '${id}' not found.`);
}

export function domainViolation(message: string): McpError {
  return new McpError(McpErrorCode.DOMAIN_VIOLATION, message);
}

export function unsupportedDomain(domain: string): McpError {
  return new McpError(
    McpErrorCode.UNSUPPORTED_DOMAIN,
    `Domain '${domain}' is not supported by this server.`,
  );
}

export function drupalApiError(message: string, details?: unknown): McpError {
  return new McpError(McpErrorCode.DRUPAL_API_ERROR, message, { details, recoverable: true });
}
