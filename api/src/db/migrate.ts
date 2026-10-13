import { Pool } from 'pg';
import { loadConfig } from '../config';
import { loadDotEnv } from '../env';
import { migrations } from './migrations';

// Arbitrary constant shared by every instance; pg_advisory_lock on it means that if several
// API containers boot at once, exactly one applies migrations and the others wait.
const MIGRATION_LOCK_ID = 727_001;

export async function runMigrations(pool: Pool, log: (msg: string) => void = () => {}): Promise<string[]> {
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id         TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
    const { rows } = await client.query<{ id: string }>('SELECT id FROM schema_migrations');
    const done = new Set(rows.map((r) => r.id));

    for (const m of migrations) {
      if (done.has(m.id)) continue;
      await client.query('BEGIN');
      try {
        await client.query(m.sql);
        await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [m.id]);
        await client.query('COMMIT');
        applied.push(m.id);
        log(`applied migration ${m.id}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`migration ${m.id} failed: ${(err as Error).message}`);
      }
    }
    return applied;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => undefined);
    client.release();
  }
}

// `npm run migrate` entry point.
if (require.main === module) {
  loadDotEnv();
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  runMigrations(pool, console.log)
    .then((applied) => console.log(applied.length ? `done (${applied.length} applied)` : 'already up to date'))
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
