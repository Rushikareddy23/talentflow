import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadDotEnv } from '../env';
import { JsonLogger } from './logger';

describe('JsonLogger level', () => {
  const saved = { LOG_LEVEL: process.env.LOG_LEVEL, NODE_ENV: process.env.NODE_ENV };
  let out: jest.SpyInstance;
  let err: jest.SpyInstance;

  beforeEach(() => {
    process.env.NODE_ENV = 'development'; // the logger is silent under NODE_ENV=test
    delete process.env.LOG_LEVEL;
    out = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    err = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });
  afterEach(() => {
    out.mockRestore();
    err.mockRestore();
    for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v);
  });

  it('honours LOG_LEVEL from a .env file loaded AFTER the logger was created (regression)', () => {
    const logger = new JsonLogger(); // created first, like the shared logger imported at startup
    const file = join(mkdtempSync(join(tmpdir(), 'tf-log-')), '.env');
    writeFileSync(file, 'LOG_LEVEL=error\n');
    loadDotEnv(file); // .env loaded later, in main()

    logger.write('info', 'should be hidden');
    logger.write('warn', 'should be hidden');
    logger.write('error', 'should be shown');

    expect(out).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalledTimes(1);
    expect(String(err.mock.calls[0][0])).toContain('should be shown');
  });

  it('defaults to info and ignores an invalid LOG_LEVEL', () => {
    const logger = new JsonLogger();
    process.env.LOG_LEVEL = 'loud';
    logger.write('debug', 'hidden');
    logger.write('info', 'shown');
    expect(out).toHaveBeenCalledTimes(1);
  });

  it('is case-insensitive', () => {
    process.env.LOG_LEVEL = 'WARN';
    const logger = new JsonLogger();
    logger.write('info', 'hidden');
    logger.write('warn', 'shown');
    expect(out).toHaveBeenCalledTimes(1);
  });
});
