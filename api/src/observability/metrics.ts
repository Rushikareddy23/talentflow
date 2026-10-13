import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/** Prometheus metrics, exposed at GET /metrics. */
export const registry = new Registry();
collectDefaultMetrics({ register: registry });

export const httpDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency by route and status',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

export const scoringTotal = new Counter({
  name: 'resume_scoring_total',
  help: 'Resume scoring results by method actually used (llm or keyword fallback)',
  labelNames: ['method'] as const,
  registers: [registry],
});

export const llmFailures = new Counter({
  name: 'llm_failures_total',
  help: 'Failed LLM scoring attempts by reason',
  labelNames: ['reason'] as const,
  registers: [registry],
});

export const llmDuration = new Histogram({
  name: 'llm_request_duration_seconds',
  help: 'LLM call latency',
  buckets: [0.25, 0.5, 1, 2, 4, 8, 15, 30],
  registers: [registry],
});
