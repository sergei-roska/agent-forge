/**
 * Structured JSON logger — writes to stderr (stdout is reserved for MCP stdio transport).
 *
 * Every line is a JSON object with at minimum { ts, level, msg }.
 * Search pipeline fields (Spec 08.2 §6 Observability):
 *   { run_id, project_path, tool, step, duration_ms, mode, result_count, warnings_count }
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  run_id?:        string;
  project_path?:  string;
  tool?:          string;
  step?:          string;
  duration_ms?:   number;
  mode?:          string;
  result_count?:  number;
  warnings_count?: number;
  /** Any extra structured fields. */
  [key: string]: unknown;
}

export interface LogEntry extends LogContext {
  ts:    string;
  level: LogLevel;
  msg:   string;
}

const LOG_LEVEL_RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function envLevel(): LogLevel {
  const v = process.env['LOG_LEVEL']?.toLowerCase();
  if (v === 'debug' || v === 'info' || v === 'warn' || v === 'error') return v;
  return 'info';
}

let minLevel: LogLevel = envLevel();

/** Override the minimum log level at runtime (used in tests). */
export function setLogLevel(level: LogLevel): void {
  minLevel = level;
}

export class Logger {
  private readonly ctx: LogContext;

  constructor(ctx: LogContext = {}) {
    this.ctx = ctx;
  }

  /** Return a child logger with additional context merged in. */
  child(ctx: LogContext): Logger {
    return new Logger({ ...this.ctx, ...ctx });
  }

  debug(msg: string, ctx?: LogContext): void { this._emit('debug', msg, ctx); }
  info (msg: string, ctx?: LogContext): void { this._emit('info',  msg, ctx); }
  warn (msg: string, ctx?: LogContext): void { this._emit('warn',  msg, ctx); }
  error(msg: string, ctx?: LogContext): void { this._emit('error', msg, ctx); }

  private _emit(level: LogLevel, msg: string, ctx?: LogContext): void {
    if (LOG_LEVEL_RANK[level] < LOG_LEVEL_RANK[minLevel]) return;

    const entry: LogEntry = {
      ts:    new Date().toISOString(),
      level,
      ...this.ctx,
      ...ctx,
      msg,
    };
    process.stderr.write(JSON.stringify(entry) + '\n');
  }
}

/** Process-wide root logger. Use `.child({run_id, tool})` for scoped loggers. */
export const rootLogger = new Logger();
