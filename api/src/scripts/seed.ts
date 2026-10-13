/**
 * Loads a demo job and sample candidates through the public API (so it exercises the real code paths).
 * Usage: start the API, then `npm run seed` (API_URL defaults to http://localhost:3000).
 * All people below are fictional.
 */
import { loadDotEnv } from '../env';

loadDotEnv();
const API = process.env.API_URL ?? 'http://localhost:3000';

const job = {
  title: 'Software Engineer, New Grad',
  description:
    'Full-stack role building internal tools, workflows and AI-powered products. You will build backend services and APIs, ' +
    'React frontends, model data in PostgreSQL, and help troubleshoot production issues.',
  requiredSkills: ['TypeScript', 'React', 'Node.js', 'PostgreSQL', 'AWS', 'REST'],
};

const candidates = [
  {
    name: 'Priya Natarajan',
    email: 'priya.n@example.com',
    resumeText:
      'MS Computer Science. Built a NestJS + Node.js REST API with PostgreSQL and a React/TypeScript dashboard, deployed on AWS ECS with Terraform. ' +
      'Wrote Jest tests and set up GitHub Actions CI. Internship: backend intern building REST services.',
  },
  {
    name: 'Marcus Lee',
    email: 'marcus.lee@example.com',
    resumeText:
      'BS Software Engineering. React and TypeScript front-end projects, a Node.js/Express REST API, MongoDB. Hackathon winner (team of 4).',
  },
  {
    name: 'Elena Petrova',
    email: 'elena.p@example.com',
    resumeText:
      'Data analyst moving into engineering. Python, pandas, SQL on PostgreSQL, built Tableau dashboards. Some AWS (S3, Lambda).',
  },
  {
    name: 'Daniel Okafor',
    email: 'daniel.o@example.com',
    resumeText:
      'Mobile developer: Swift and Kotlin apps, Firebase backend, CI with Fastlane. Comfortable with Git and code reviews.',
  },
  {
    name: 'Sofia Martinez',
    email: 'sofia.m@example.com',
    resumeText:
      'Full-stack: TypeScript everywhere. Next.js/React UI, Node.js REST APIs, PostgreSQL schema design and query tuning, AWS Lambda and RDS. Open-source contributor.',
  },
  {
    name: 'Wei Zhang',
    email: 'wei.z@example.com',
    resumeText: 'Embedded C and C++ on ARM microcontrollers, RTOS, CAN bus. Python test automation.',
  },
];

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

async function patch(path: string, body: unknown) {
  const res = await fetch(`${API}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}: ${await res.text()}`);
  return (await res.json()) as { version: number };
}

async function main() {
  const created = await post<{ id: number }>('/jobs', job);
  console.log(`created job ${created.id}: ${job.title}`);

  const ids: Array<{ id: number; version: number }> = [];
  for (const c of candidates) {
    const cand = await post<{ id: number; version: number }>(`/jobs/${created.id}/candidates`, c);
    const scored = await post<{ score: number; scoreMethod: string }>(`/candidates/${cand.id}/score`);
    console.log(`  ${c.name.padEnd(18)} score ${String(scored.score).padStart(3)} (${scored.scoreMethod})`);
    ids.push(cand);
  }

  // Spread a few candidates across the pipeline so the board isn't all in one column.
  let v = await patch(`/candidates/${ids[0].id}/stage`, { stage: 'screening', version: 1 });
  v = await patch(`/candidates/${ids[0].id}/stage`, { stage: 'interview', version: v.version });
  await patch(`/candidates/${ids[4].id}/stage`, { stage: 'screening', version: 1 });
  await patch(`/candidates/${ids[5].id}/stage`, { stage: 'rejected', version: 1 });
  console.log('done');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
