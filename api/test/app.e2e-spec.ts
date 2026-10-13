import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { createApp } from '../src/bootstrap';
import { loadConfig } from '../src/config';

/**
 * End-to-end tests: real HTTP requests against the real NestJS app and a real PostgreSQL database.
 * Needs TEST_DATABASE_URL (defaults to a local talentflow_test DB). The schema is wiped before the run.
 */
const databaseUrl = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/talentflow_test';

let app: INestApplication;
let http: ReturnType<typeof request>;

const resume = (extra = '') =>
  `Full-stack engineer. Built React and TypeScript dashboards, Node.js REST APIs and PostgreSQL schemas. ${extra}`;

beforeAll(async () => {
  const admin = new Pool({ connectionString: databaseUrl });
  await admin.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await admin.end();

  // No LLM_BASE_URL -> deterministic keyword scoring, so the tests never call a real model.
  app = await createApp(loadConfig({ DATABASE_URL: databaseUrl }));
  await app.init();
  http = request(app.getHttpServer());
});

afterAll(async () => {
  await app?.close();
});

async function createJob(overrides: Record<string, unknown> = {}) {
  const res = await http
    .post('/jobs')
    .send({
      title: 'Software Engineer, New Grad',
      description: 'Full-stack role building internal tools and AI-powered products.',
      requiredSkills: ['React', 'Node.js', 'PostgreSQL', 'AWS'],
      ...overrides,
    })
    .expect(201);
  return res.body as { id: number };
}

async function createCandidate(jobId: number, email: string, resumeText = resume()) {
  const res = await http.post(`/jobs/${jobId}/candidates`).send({ name: 'Test Person', email, resumeText }).expect(201);
  return res.body as { id: number; version: number; stage: string };
}

describe('health & observability', () => {
  it('GET /health reports the database as up', async () => {
    const res = await http.get('/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'up' });
  });

  it('GET /metrics exposes Prometheus metrics, labelled by route pattern', async () => {
    await http.get('/jobs').expect(200);
    const res = await http.get('/metrics').expect(200);
    expect(res.text).toContain('http_request_duration_seconds');
    expect(res.text).toContain('route="/jobs"');
  });

  it('echoes a valid X-Request-Id and generates one otherwise', async () => {
    const echoed = await http.get('/jobs').set('x-request-id', 'abc-123');
    expect(echoed.headers['x-request-id']).toBe('abc-123');
    const generated = await http.get('/jobs');
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('jobs', () => {
  it('creates a job and de-duplicates skills case-insensitively', async () => {
    const res = await http
      .post('/jobs')
      .send({ title: 'SWE', description: 'desc', requiredSkills: ['React', 'react', 'AWS'] })
      .expect(201);
    expect(res.body.requiredSkills).toEqual(['React', 'AWS']);
  });

  it('rejects invalid input with field-level errors', async () => {
    const res = await http.post('/jobs').send({ title: '', description: 'x' }).expect(400);
    expect(res.body.errors[0]).toMatchObject({ path: 'title' });
  });

  it('returns 404 for a missing job and 400 for a non-numeric id', async () => {
    await http.get('/jobs/999999').expect(404);
    await http.get('/jobs/abc').expect(400);
  });
});

describe('candidates', () => {
  it('creates a candidate in the applied stage and records a created event', async () => {
    const job = await createJob();
    const c = await createCandidate(job.id, 'Ada@Example.com');
    expect(c).toMatchObject({ stage: 'applied', version: 1, score: null });

    const detail = await http.get(`/candidates/${c.id}`).expect(200);
    expect(detail.body.email).toBe('ada@example.com'); // normalized
    expect(detail.body.allowedNextStages).toEqual(['screening', 'rejected']);

    const events = await http.get(`/candidates/${c.id}/events`).expect(200);
    expect(events.body).toEqual([expect.objectContaining({ type: 'created', toStage: 'applied' })]);
  });

  it('returns 409 when the same email applies twice to one job', async () => {
    const job = await createJob();
    await createCandidate(job.id, 'dup@example.com');
    await http
      .post(`/jobs/${job.id}/candidates`)
      .send({ name: 'Dup', email: 'DUP@example.com', resumeText: resume() })
      .expect(409);
  });

  it('returns 404 when applying to a job that does not exist', async () => {
    await http
      .post('/jobs/999999/candidates')
      .send({ name: 'X', email: 'x@example.com', resumeText: resume() })
      .expect(404);
  });

  it('scores a resume and stores matched and missing skills', async () => {
    const job = await createJob();
    const c = await createCandidate(job.id, 'score@example.com');
    const res = await http.post(`/candidates/${c.id}/score`).expect(200);
    expect(res.body).toMatchObject({
      score: 75,
      scoreMethod: 'keyword',
      matchedSkills: ['React', 'Node.js', 'PostgreSQL'],
      missingSkills: ['AWS'],
    });
    const events = await http.get(`/candidates/${c.id}/events`).expect(200);
    expect(events.body.at(-1)).toMatchObject({ type: 'scored', payload: { score: 75, method: 'keyword' } });
  });
});

describe('pipeline stage moves', () => {
  it('moves forward and bumps the version', async () => {
    const job = await createJob();
    const c = await createCandidate(job.id, 'move@example.com');
    const res = await http.patch(`/candidates/${c.id}/stage`).send({ stage: 'screening', version: 1 }).expect(200);
    expect(res.body).toMatchObject({ stage: 'screening', version: 2 });
  });

  it('rejects an illegal transition with 422 and lists the allowed stages', async () => {
    const job = await createJob();
    const c = await createCandidate(job.id, 'skip@example.com');
    const res = await http.patch(`/candidates/${c.id}/stage`).send({ stage: 'hired', version: 1 }).expect(422);
    expect(res.body.allowedNextStages).toEqual(['screening', 'rejected']);
  });

  it('rejects a stale version with 409 (optimistic locking)', async () => {
    const job = await createJob();
    const c = await createCandidate(job.id, 'stale@example.com');
    await http.patch(`/candidates/${c.id}/stage`).send({ stage: 'screening', version: 1 }).expect(200);
    const res = await http.patch(`/candidates/${c.id}/stage`).send({ stage: 'rejected', version: 1 }).expect(409);
    expect(res.body).toMatchObject({ currentVersion: 2, currentStage: 'screening' });
  });

  it('lets exactly one of 10 concurrent moves win', async () => {
    const job = await createJob();
    const c = await createCandidate(job.id, 'race@example.com');
    const results = await Promise.all(
      Array.from({ length: 10 }, () => http.patch(`/candidates/${c.id}/stage`).send({ stage: 'screening', version: 1 })),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(9);

    const events = await http.get(`/candidates/${c.id}/events`).expect(200);
    expect(events.body.filter((e: { type: string }) => e.type === 'stage_changed')).toHaveLength(1);
  });

  it('reports per-stage counts for a job', async () => {
    const job = await createJob();
    const a = await createCandidate(job.id, 'count1@example.com');
    await createCandidate(job.id, 'count2@example.com');
    await http.patch(`/candidates/${a.id}/stage`).send({ stage: 'rejected', version: 1 }).expect(200);
    const res = await http.get(`/jobs/${job.id}/stage-counts`).expect(200);
    expect(res.body).toEqual({ applied: 1, screening: 0, interview: 0, offer: 0, hired: 0, rejected: 1 });
  });
});

describe('keyset pagination', () => {
  it('pages through candidates best-score-first with no duplicates or gaps', async () => {
    const job = await createJob({ requiredSkills: ['React', 'Node.js', 'PostgreSQL', 'AWS'] });
    // Resumes matching 0..4 skills -> scores 0, 25, 50, 75, 100; plus 2 never scored.
    const variants = [
      'Plain text with no matching skills at all here.',
      'I know React well and nothing else listed here.',
      'I know React and Node.js but little else here.',
      'React, Node.js and PostgreSQL experience here.',
      'React, Node.js, PostgreSQL and AWS experience here.',
    ];
    const ids: number[] = [];
    for (let i = 0; i < variants.length; i++) {
      const c = await createCandidate(job.id, `page${i}@example.com`, variants[i]);
      await http.post(`/candidates/${c.id}/score`).expect(200);
      ids.push(c.id);
    }
    for (let i = 0; i < 2; i++) ids.push((await createCandidate(job.id, `unscored${i}@example.com`)).id);

    const seen: Array<{ id: number; score: number | null }> = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const res: request.Response = await http
        .get(`/jobs/${job.id}/candidates`)
        .query({ stage: 'applied', limit: 2, ...(cursor ? { cursor } : {}) })
        .expect(200);
      seen.push(...res.body.items);
      cursor = res.body.nextCursor;
      pages++;
    } while (cursor);

    expect(pages).toBe(4);
    expect(seen.map((c) => c.score)).toEqual([100, 75, 50, 25, 0, null, null]);
    expect(new Set(seen.map((c) => c.id)).size).toBe(7);
    expect(seen.every((c) => !('resumeText' in c))).toBe(true);
  });

  it('rejects a tampered cursor with 400', async () => {
    const job = await createJob();
    await http.get(`/jobs/${job.id}/candidates`).query({ cursor: 'bogus!!' }).expect(400);
  });
});
