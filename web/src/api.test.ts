import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, errorMessage, parseSkills } from './api';

afterEach(() => vi.unstubAllGlobals());

describe('parseSkills', () => {
  it('splits on commas and newlines and trims blanks', () => {
    expect(parseSkills('React, Node.js,\n AWS ,, ')).toEqual(['React', 'Node.js', 'AWS']);
  });
});

describe('errorMessage', () => {
  it('reads string and array messages from Nest error bodies', () => {
    expect(errorMessage({ message: 'Candidate was changed' }, 409)).toBe('Candidate was changed');
    expect(errorMessage({ message: ['a', 'b'] }, 400)).toBe('a; b');
  });
  it('falls back to the status code', () => {
    expect(errorMessage(null, 502)).toBe('Request failed (HTTP 502)');
  });
});

describe('api client', () => {
  it('sends the version with stage moves and surfaces 409 conflicts as ApiError', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Candidate was changed by someone else' }), { status: 409 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const err = await api.moveStage(7, 'screening', 3).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(409);
    expect(err.message).toMatch(/someone else/);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/candidates/7/stage');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ stage: 'screening', version: 3 });
  });

  it('passes the stage and cursor as query parameters', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [], nextCursor: null })));
    vi.stubGlobal('fetch', fetchMock);
    await api.listCandidates(3, 'interview', 'abc');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/jobs/3/candidates?stage=interview&limit=25&cursor=abc');
  });
});
