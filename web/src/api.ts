/** Typed client for the TalentFlow REST API. */

export const STAGES = ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'] as const;
export type Stage = (typeof STAGES)[number];

export interface Job {
  id: number;
  title: string;
  description: string;
  requiredSkills: string[];
  createdAt: string;
}

export interface Candidate {
  id: number;
  jobId: number;
  name: string;
  email: string;
  stage: Stage;
  score: number | null;
  scoreSummary: string | null;
  scoreMethod: 'llm' | 'keyword' | null;
  matchedSkills: string[];
  missingSkills: string[];
  version: number;
  createdAt: string;
}

export interface CandidateDetail extends Candidate {
  resumeText: string;
  allowedNextStages: Stage[];
}

export interface CandidateEvent {
  id: number;
  type: 'created' | 'stage_changed' | 'scored';
  fromStage: Stage | null;
  toStage: Stage | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body: unknown,
  ) {
    super(message);
  }
}

const BASE = import.meta.env.VITE_API_URL ?? '/api';

/** Turns Nest error bodies ({message: string | string[] | {message}}) into one readable sentence. */
export function errorMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const m = (body as { message: unknown }).message;
    if (typeof m === 'string') return m;
    if (Array.isArray(m)) return m.join('; ');
  }
  return `Request failed (HTTP ${status})`;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, errorMessage(body, res.status), body);
  return body as T;
}

export const api = {
  listJobs: () => call<Job[]>('/jobs'),
  createJob: (input: { title: string; description: string; requiredSkills: string[] }) =>
    call<Job>('/jobs', { method: 'POST', body: JSON.stringify(input) }),
  listCandidates: (jobId: number, stage: Stage, cursor?: string | null, limit = 25) => {
    const q = new URLSearchParams({ stage, limit: String(limit) });
    if (cursor) q.set('cursor', cursor);
    return call<Page<Candidate>>(`/jobs/${jobId}/candidates?${q}`);
  },
  createCandidate: (jobId: number, input: { name: string; email: string; resumeText: string }) =>
    call<Candidate>(`/jobs/${jobId}/candidates`, { method: 'POST', body: JSON.stringify(input) }),
  getCandidate: (id: number) => call<CandidateDetail>(`/candidates/${id}`),
  events: (id: number) => call<CandidateEvent[]>(`/candidates/${id}/events`),
  score: (id: number) => call<Candidate>(`/candidates/${id}/score`, { method: 'POST' }),
  moveStage: (id: number, stage: Stage, version: number) =>
    call<Candidate>(`/candidates/${id}/stage`, { method: 'PATCH', body: JSON.stringify({ stage, version }) }),
};

/** Splits "React, Node.js,  AWS" into ["React", "Node.js", "AWS"]. */
export function parseSkills(raw: string): string[] {
  return raw
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
