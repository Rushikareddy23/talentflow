/**
 * All runtime configuration comes from environment variables, read once at startup.
 * Nothing secret is hard-coded; see .env.example for the full list.
 */
export interface AppConfig {
  port: number;
  databaseUrl: string;
  runMigrations: boolean;
  llm: {
    /** OpenAI-compatible base URL, e.g. https://api.openai.com/v1 or http://localhost:8000/v1 for vLLM/Ollama. */
    baseUrl: string | null;
    apiKey: string | null;
    model: string;
    timeoutMs: number;
    maxAttempts: number;
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: Number(env.PORT ?? 3000),
    databaseUrl: env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/talentflow',
    runMigrations: env.RUN_MIGRATIONS !== 'false',
    llm: {
      baseUrl: env.LLM_BASE_URL?.replace(/\/+$/, '') || null,
      apiKey: env.LLM_API_KEY || null,
      model: env.LLM_MODEL ?? 'gpt-4o-mini',
      timeoutMs: Number(env.LLM_TIMEOUT_MS ?? 15000),
      maxAttempts: Number(env.LLM_MAX_ATTEMPTS ?? 2),
    },
  };
}

export const APP_CONFIG = Symbol('APP_CONFIG');
