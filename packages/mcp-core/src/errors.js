"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.McpError = exports.McpErrorCode = void 0;
exports.validationError = validationError;
exports.notFoundError = notFoundError;
exports.domainViolation = domainViolation;
exports.unsupportedDomain = unsupportedDomain;
exports.drupalApiError = drupalApiError;
var McpErrorCode;
(function (McpErrorCode) {
    McpErrorCode["VALIDATION_ERROR"] = "VALIDATION_ERROR";
    McpErrorCode["NOT_FOUND"] = "NOT_FOUND";
    McpErrorCode["UNAUTHORIZED"] = "UNAUTHORIZED";
    McpErrorCode["FORBIDDEN"] = "FORBIDDEN";
    McpErrorCode["TIMEOUT"] = "TIMEOUT";
    McpErrorCode["RATE_LIMITED"] = "RATE_LIMITED";
    McpErrorCode["INTERNAL_ERROR"] = "INTERNAL_ERROR";
    McpErrorCode["DOMAIN_VIOLATION"] = "DOMAIN_VIOLATION";
    McpErrorCode["TRUNCATED_RESPONSE"] = "TRUNCATED_RESPONSE";
    McpErrorCode["UNSUPPORTED_DOMAIN"] = "UNSUPPORTED_DOMAIN";
    McpErrorCode["DRUPAL_API_ERROR"] = "DRUPAL_API_ERROR";
})(McpErrorCode || (exports.McpErrorCode = McpErrorCode = {}));
class McpError extends Error {
    code;
    details;
    recoverable;
    constructor(code, message, options) {
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
exports.McpError = McpError;
// ---------- Convenience Factories ----------
function validationError(message, details) {
    return new McpError(McpErrorCode.VALIDATION_ERROR, message, { details, recoverable: true });
}
function notFoundError(resource, id) {
    return new McpError(McpErrorCode.NOT_FOUND, `${resource} '${id}' not found.`);
}
function domainViolation(message) {
    return new McpError(McpErrorCode.DOMAIN_VIOLATION, message);
}
function unsupportedDomain(domain) {
    return new McpError(McpErrorCode.UNSUPPORTED_DOMAIN, `Domain '${domain}' is not supported by this server.`);
}
function drupalApiError(message, details) {
    return new McpError(McpErrorCode.DRUPAL_API_ERROR, message, { details, recoverable: true });
}
