/**
 * Measures the board query with and without the composite index, and keyset vs OFFSET pagination.
 *
 *   BENCH_ROWS=200000 npm run bench
 *
 * Inserts synthetic candidates into a temporary job (deleted at the end), then times each query
 * with EXPLAIN ANALYZE (server-side execution time, no network noise) and reports the median.
 * Use a scratch database: DATABASE_URL=postgres://.../talentflow_bench
 */
import { Pool, PoolClient } from 'pg';
import { loadConfig } from '../config';
import { runMigrations } from '../db/migrate';
import { loadDotEnv } from '../env';

// Load .env before reading any settings below.
loadDotEnv();

const ROWS = Number(process.env.BENCH_ROWS ?? 200_000);
const RUNS = Number(process.env.BENCH_RUNS ?? 25);
const PAGE = 25;
const DEEP_PAGE = 400; // page number used to compare OFFSET with keyset

async function execMs(c: PoolClient, sql: string, params: unknown[]): Promise<number> {
  const { rows } = await c.query(`EXPLAIN (ANALYZE, FORMAT JSON) ${sql}`, params);
  return rows[0]['QUERY PLAN'][0]['Execution Time'] as number;
}

async function median(c: PoolClient, sql: string, params: unknown[]): Promise<number> {
  for (let i = 0; i < 3; i++) await execMs(c, sql, params); // warm-up
  const t: number[] = [];
  for (let i = 0; i < RUNS; i++) t.push(await execMs(c, sql, params));
  t.sort((a, b) => a - b);
  return t[Math.floor(t.length / 2)];
}

async function planNode(c: PoolClient, sql: string, params: unknown[]): Promise<string> {
  const { rows } = await c.query(`EXPLAIN (FORMAT JSON) ${sql}`, params);
  const types: string[] = [];
  const walk = (n: { 'Node Type': string; Plans?: unknown[] }) => {
    types.push(n['Node Type']);
    (n.Plans as (typeof n)[] | undefined)?.forEach(walk);
  };
  walk(rows[0]['QUERY PLAN'][0].Plan);
  return types.join(' > ');
}

const FIRST_PAGE = `
  SELECT id, name, score FROM candidates
   WHERE job_id = $1 AND stage = $2
   ORDER BY COALESCE(score, -1) DESC, id DESC
   LIMIT ${PAGE}`;

const KEYSET_PAGE = `
  SELECT id, name, score FROM candidates
   WHERE job_id = $1 AND stage = $2 AND (COALESCE(score, -1), id) < ($3, $4)
   ORDER BY COALESCE(score, -1) DESC, id DESC
   LIMIT ${PAGE}`;

const OFFSET_PAGE = `
  SELECT id, name, score FROM candidates
   WHERE job_id = $1 AND stage = $2
   ORDER BY COALESCE(score, -1) DESC, id DESC
   LIMIT ${PAGE} OFFSET ${PAGE * (DEEP_PAGE - 1)}`;

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? loadConfig().databaseUrl });
  await runMigrations(pool);
  const c = await pool.connect();
  let jobId: number | null = null;
  try {
    // A second, busy job makes the table realistic: the index must isolate one job's rows.
    const { rows } = await c.query(
      `INSERT INTO jobs (title, description, required_skills) VALUES
         ('bench target', 'bench', '{}'), ('bench noise', 'bench', '{}') RETURNING id`,
    );
    jobId = Number(rows[0].id);
    const noiseId = Number(rows[1].id);

    console.log(`inserting ${ROWS.toLocaleString()} candidates...`);
    await c.query(
      `INSERT INTO candidates (job_id, name, email, resume_text, stage, score)
       SELECT CASE WHEN g % 2 = 0 THEN $1::bigint ELSE $2::bigint END,
              'Candidate ' || g, 'c' || g || '@bench.test', 'resume text',
              (ARRAY['applied','applied','applied','screening','interview','offer','hired','rejected'])[1 + g % 8],
              CASE WHEN g % 10 = 0 THEN NULL ELSE ((g::bigint * 7919) % 101)::int END
         FROM generate_series(1, $3::int) g`,
      [jobId, noiseId, ROWS],
    );
    await c.query('ANALYZE candidates');

    const [{ count }] = (
      await c.query(`SELECT count(*) FROM candidates WHERE job_id = $1 AND stage = 'applied'`, [jobId])
    ).rows;
    console.log(`target job has ${Number(count).toLocaleString()} candidates in 'applied'\n`);

    // Cursor positioned at the start of DEEP_PAGE, for an apples-to-apples keyset vs OFFSET comparison.
    const anchor = (
      await c.query(
        `SELECT COALESCE(score, -1) AS s, id FROM candidates WHERE job_id = $1 AND stage = 'applied'
          ORDER BY COALESCE(score, -1) DESC, id DESC OFFSET ${PAGE * (DEEP_PAGE - 1) - 1} LIMIT 1`,
        [jobId],
      )
    ).rows[0];

    const results: Record<string, { ms: number; plan: string }> = {};
    const measure = async (label: string, sql: string, params: unknown[]) => {
      results[label] = { ms: await median(c, sql, params), plan: await planNode(c, sql, params) };
    };

    // 1) Without the index: drop it inside a transaction and roll back afterwards.
    await c.query('BEGIN');
    await c.query('DROP INDEX candidates_board_idx');
    await measure('first page, no index', FIRST_PAGE, [jobId, 'applied']);
    await measure(`page ${DEEP_PAGE} via OFFSET, no index`, OFFSET_PAGE, [jobId, 'applied']);
    await c.query('ROLLBACK');

    // 2) With the index.
    await measure('first page, with index', FIRST_PAGE, [jobId, 'applied']);
    await measure(`page ${DEEP_PAGE} via OFFSET, with index`, OFFSET_PAGE, [jobId, 'applied']);
    await measure(`page ${DEEP_PAGE} via keyset, with index`, KEYSET_PAGE, [jobId, 'applied', anchor.s, anchor.id]);

    console.log(`median of ${RUNS} runs (server execution time)`);
    for (const [label, r] of Object.entries(results)) {
      console.log(`  ${label.padEnd(34)} ${r.ms.toFixed(3).padStart(9)} ms   ${r.plan}`);
    }
    const noIdx = results['first page, no index'].ms;
    const idx = results['first page, with index'].ms;
    const off = results[`page ${DEEP_PAGE} via OFFSET, with index`].ms;
    const key = results[`page ${DEEP_PAGE} via keyset, with index`].ms;
    console.log(`\nindex speedup (first page): ${(noIdx / idx).toFixed(0)}x`);
    console.log(`keyset vs OFFSET (page ${DEEP_PAGE}): ${(off / key).toFixed(0)}x faster`);
  } finally {
    if (jobId !== null) await c.query(`DELETE FROM jobs WHERE title IN ('bench target', 'bench noise')`);
    c.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
