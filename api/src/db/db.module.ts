import { Global, Inject, Injectable, Module, OnApplicationShutdown } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { APP_CONFIG, AppConfig } from '../config';

export const PG_POOL = Symbol('PG_POOL');

/** Thin wrapper over the pg pool: plain parameterized SQL plus a transaction helper. */
@Injectable()
export class Database implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) readonly pool: Pool) {}

  async query<T extends object>(sql: string, params: unknown[] = []): Promise<T[]> {
    const { rows } = await this.pool.query<T>(sql, params);
    return rows;
  }

  /** Runs `fn` in a transaction; commits on success, rolls back on any thrown error. */
  async tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => new Pool({ connectionString: config.databaseUrl, max: 10 }),
    },
    Database,
  ],
  exports: [Database],
})
export class DbModule {}
