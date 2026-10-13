import { LoggerService } from '@nestjs/common';

type Level = 'debug' | 'info' | 'warn' | 'error';

/**
 * Structured logger: one JSON object per line, so logs can be searched and aggregated
 * (CloudWatch, Loki, Datadog...) by field instead of grepping free text.
 */
export class JsonLogger implements LoggerService {
  /**
   * @param fixedLevel optional explicit level. When omitted, LOG_LEVEL is read on every write rather than
   * once at import time: the shared logger is created before main() loads .env, so reading it eagerly
   * would silently ignore a LOG_LEVEL set in .env.
   */
  constructor(private readonly fixedLevel?: Level) {}

  private static readonly order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

  get minLevel(): Level {
    if (this.fixedLevel) return this.fixedLevel;
    const fromEnv = process.env.LOG_LEVEL?.toLowerCase();
    return fromEnv && fromEnv in JsonLogger.order ? (fromEnv as Level) : 'info';
  }

  write(level: Level, msg: string, fields: Record<string, unknown> = {}): void {
    if (process.env.NODE_ENV === 'test' && level !== 'error') return;
    if (JsonLogger.order[level] < JsonLogger.order[this.minLevel]) return;
    const line = JSON.stringify({ time: new Date().toISOString(), level, msg, ...fields });
    (level === 'error' ? process.stderr : process.stdout).write(line + '\n');
  }

  // Nest's LoggerService interface: (message, ...optionalParams) where the last param is the context.
  log(message: unknown, ...rest: unknown[]) {
    this.write('info', String(message), contextOf(rest));
  }
  warn(message: unknown, ...rest: unknown[]) {
    this.write('warn', String(message), contextOf(rest));
  }
  error(message: unknown, ...rest: unknown[]) {
    this.write('error', String(message), contextOf(rest));
  }
  debug(message: unknown, ...rest: unknown[]) {
    this.write('debug', String(message), contextOf(rest));
  }
  verbose(message: unknown, ...rest: unknown[]) {
    this.write('debug', String(message), contextOf(rest));
  }
}

function contextOf(rest: unknown[]): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const r of rest) {
    if (typeof r === 'string') fields.context = r;
    else if (r && typeof r === 'object') Object.assign(fields, r);
  }
  return fields;
}

export const logger = new JsonLogger();
