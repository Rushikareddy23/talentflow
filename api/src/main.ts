import 'reflect-metadata';
import { createApp } from './bootstrap';
import { loadConfig } from './config';
import { loadDotEnv } from './env';
import { logger } from './observability/logger';

async function main() {
  const envFile = loadDotEnv();
  const config = loadConfig();
  const app = await createApp(config);
  await app.listen(config.port);
  logger.write('info', 'server_started', {
    port: config.port,
    envFile: envFile ?? 'none (using environment variables)',
    scoring: config.llm.baseUrl ? `llm (${config.llm.model})` : 'keyword only (no LLM_BASE_URL set)',
  });
}

main().catch((err) => {
  logger.write('error', 'startup_failed', { error: (err as Error).message });
  process.exit(1);
});
