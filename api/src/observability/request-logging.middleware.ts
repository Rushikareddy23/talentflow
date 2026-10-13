import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { logger } from './logger';
import { httpDuration } from './metrics';

/**
 * Assigns every request an ID (or keeps the caller's X-Request-Id), returns it in the response,
 * and on completion emits one structured log line plus a latency metric.
 * The route *pattern* (e.g. /candidates/:id) is used as the metric label, never the raw URL,
 * so metric cardinality stays bounded.
 */
export function requestLogging(req: Request, res: Response, next: NextFunction): void {
  const started = process.hrtime.bigint();
  const incoming = req.header('x-request-id');
  const requestId = incoming && /^[\w-]{1,64}$/.test(incoming) ? incoming : randomUUID();
  res.setHeader('x-request-id', requestId);

  res.on('finish', () => {
    const seconds = Number(process.hrtime.bigint() - started) / 1e9;
    const route = req.route?.path ? `${req.baseUrl}${req.route.path}` : 'unmatched';
    httpDuration.observe({ method: req.method, route, status: String(res.statusCode) }, seconds);
    if (route === '/metrics' || route === '/health') return; // keep probe noise out of the logs
    logger.write(res.statusCode >= 500 ? 'error' : 'info', 'http_request', {
      requestId,
      method: req.method,
      route,
      status: res.statusCode,
      durationMs: Math.round(seconds * 1000 * 10) / 10,
    });
  });
  next();
}
