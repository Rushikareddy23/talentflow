import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from './config';
import { loadDotEnv } from './env';

describe('loadDotEnv', () => {
  const keys = ['TF_TEST_FROM_FILE', 'TF_TEST_OVERRIDE', 'DATABASE_URL', 'LLM_BASE_URL'];
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => keys.forEach((k) => (saved[k] = process.env[k])));
  afterEach(() =>
    keys.forEach((k) => (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]))),
  );

  function envFile(contents: string): string {
    const file = join(mkdtempSync(join(tmpdir(), 'tf-env-')), '.env');
    writeFileSync(file, contents);
    return file;
  }

  it('loads values from the file and feeds them into the app config', () => {
    delete process.env.DATABASE_URL;
    delete process.env.LLM_BASE_URL;
    const file = envFile(
      'TF_TEST_FROM_FILE=hello\nDATABASE_URL=postgres://u:p@db:5432/x\nLLM_BASE_URL=http://localhost:11434/v1/\n',
    );
    expect(loadDotEnv(file)).toBe(file);
    expect(process.env.TF_TEST_FROM_FILE).toBe('hello');
    const config = loadConfig();
    expect(config.databaseUrl).toBe('postgres://u:p@db:5432/x');
    expect(config.llm.baseUrl).toBe('http://localhost:11434/v1'); // trailing slash trimmed
  });

  it('never overrides a variable already set in the real environment', () => {
    process.env.TF_TEST_OVERRIDE = 'from-shell';
    loadDotEnv(envFile('TF_TEST_OVERRIDE=from-file\n'));
    expect(process.env.TF_TEST_OVERRIDE).toBe('from-shell');
  });

  it('treats an empty LLM_BASE_URL (as in .env.example) as "no LLM"', () => {
    delete process.env.LLM_BASE_URL;
    loadDotEnv(envFile('LLM_BASE_URL=\n'));
    expect(loadConfig().llm.baseUrl).toBeNull();
  });

  it('returns null and does nothing when the file does not exist', () => {
    expect(loadDotEnv('/nonexistent/path/.env')).toBeNull();
  });
});
