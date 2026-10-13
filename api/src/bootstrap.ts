import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppConfig } from './config';
import { Database } from './db/db.module';
import { runMigrations } from './db/migrate';
import { logger } from './observability/logger';
import { requestLogging } from './observability/request-logging.middleware';

/** Builds a fully configured app. Shared by main.ts and the e2e tests so both run identical wiring. */
export async function createApp(config: AppConfig): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule.forRoot(config), { logger, bufferLogs: false });
  app.use(requestLogging);
  app.enableCors({ origin: process.env.CORS_ORIGIN?.split(',') ?? true });
  app.enableShutdownHooks();

  if (config.runMigrations) {
    const applied = await runMigrations(app.get(Database).pool, (m) => logger.write('info', m));
    if (applied.length) logger.write('info', 'migrations_applied', { applied });
  }
  return app;
}
