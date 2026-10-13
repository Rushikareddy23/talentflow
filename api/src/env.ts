import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

/**
 * Loads KEY=value pairs from a .env file into process.env (Node's built-in parser, no dependency).
 * Variables already set in the real environment win, so `PORT=4000 npm start` still overrides the file.
 * A missing file is fine: in Docker/CI the configuration comes from real environment variables.
 *
 * Path: $ENV_FILE if set, otherwise .env in the current working directory (run commands from api/).
 */
export function loadDotEnv(path = process.env.ENV_FILE ?? '.env'): string | null {
  const file = resolve(path);
  if (!existsSync(file)) return null;
  const values = parseEnv(readFileSync(file, 'utf8'));
  for (const [key, value] of Object.entries(values)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
  return file;
}
