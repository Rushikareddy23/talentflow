import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Candidate, Page } from './api';
import { appendUnique, useBoard } from './useBoard';

/**
 * A fetch stub where each request stays pending until the test resolves it, so tests can
 * deliver responses in any order (e.g. the old job's response arriving after the new job's).
 */
interface Pending {
  url: string;
  resolve: (page: Page<Candidate>) => void;
  fail: (status: number) => void;
}
let pending: Pending[];

beforeEach(() => {
  pending = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(
      (url: string) =>
        new Promise<Response>((res) => {
          pending.push({
            url,
            resolve: (page) => res(new Response(JSON.stringify(page))),
            fail: (status) => res(new Response(JSON.stringify({ message: `boom ${status}` }), { status })),
          });
        }),
    ),
  );
});
afterEach(() => vi.unstubAllGlobals());

const cand = (id: number, jobId: number, stage = 'applied'): Candidate => ({
  id,
  jobId,
  name: `C${id}`,
  email: `c${id}@x.test`,
  stage: stage as Candidate['stage'],
  score: null,
  scoreSummary: null,
  scoreMethod: null,
  matchedSkills: [],
  missingSkills: [],
  version: 1,
  createdAt: '',
});

/** Resolves every pending request whose URL matches, using `page` for the "applied" column and empty pages otherwise. */
async function answer(match: RegExp, applied: Page<Candidate>) {
  const hits = pending.filter((p) => match.test(p.url));
  pending = pending.filter((p) => !match.test(p.url));
  await act(async () => {
    for (const p of hits) p.resolve(/stage=applied/.test(p.url) ? applied : { items: [], nextCursor: null });
  });
}

const noop = () => {};

describe('appendUnique', () => {
  it('skips candidates already in the column', () => {
    const out = appendUnique([cand(1, 1), cand(2, 1)], [cand(2, 1), cand(3, 1)]);
    expect(out.map((c) => c.id)).toEqual([1, 2, 3]);
  });
});

describe('useBoard', () => {
  it('ignores a late response for the previously selected job', async () => {
    const { result, rerender } = renderHook(({ jobId }) => useBoard(jobId, noop), { initialProps: { jobId: 1 } });
    rerender({ jobId: 2 }); // user switches jobs before job 1 has loaded

    await answer(/\/jobs\/2\//, { items: [cand(20, 2)], nextCursor: null });
    await answer(/\/jobs\/1\//, { items: [cand(10, 1)], nextCursor: null }); // stale, arrives last

    expect(result.current.columns.applied.items.map((c) => c.jobId)).toEqual([2]);
  });

  it('clears the board immediately when the job changes', async () => {
    const { result, rerender } = renderHook(({ jobId }) => useBoard(jobId, noop), { initialProps: { jobId: 1 } });
    await answer(/\/jobs\/1\//, { items: [cand(10, 1)], nextCursor: null });
    expect(result.current.columns.applied.items).toHaveLength(1);
    rerender({ jobId: 2 });
    expect(result.current.columns.applied.items).toHaveLength(0);
  });

  it('sends only one "Load more" request on repeated clicks and appends without duplicates', async () => {
    const { result } = renderHook(() => useBoard(1, noop));
    await answer(/./, { items: [cand(1, 1), cand(2, 1)], nextCursor: 'c1' });

    act(() => {
      void result.current.loadMore('applied');
      void result.current.loadMore('applied');
      void result.current.loadMore('applied');
    });
    const more = pending.filter((p) => p.url.includes('cursor=c1'));
    expect(more).toHaveLength(1);
    expect(result.current.loadingMore.applied).toBe(true);

    await answer(/cursor=c1/, { items: [cand(2, 1), cand(3, 1)], nextCursor: null }); // overlaps id 2
    expect(result.current.columns.applied.items.map((c) => c.id)).toEqual([1, 2, 3]);
    expect(result.current.loadingMore.applied).toBe(false);
  });

  it('reports a failed "Load more", keeps the items, and allows a retry', async () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useBoard(1, onError));
    await answer(/./, { items: [cand(1, 1)], nextCursor: 'c1' });

    act(() => void result.current.loadMore('applied'));
    await act(async () => pending.shift()!.fail(500));

    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.stringMatching(/Could not load more.*boom 500/)));
    expect(result.current.columns.applied.items.map((c) => c.id)).toEqual([1]);
    expect(result.current.loadingMore.applied).toBe(false);

    act(() => void result.current.loadMore('applied')); // retry is allowed
    expect(pending.filter((p) => p.url.includes('cursor=c1'))).toHaveLength(1);
  });

  it('discards a "Load more" result if the column was reloaded meanwhile', async () => {
    const { result } = renderHook(() => useBoard(1, noop));
    await answer(/./, { items: [cand(1, 1)], nextCursor: 'c1' });

    act(() => void result.current.loadMore('applied'));
    act(() => void result.current.reload(['applied']));
    await answer(/stage=applied&limit=25$/, { items: [cand(5, 1), cand(1, 1)], nextCursor: null }); // fresh reload
    await answer(/cursor=c1/, { items: [cand(2, 1)], nextCursor: null }); // old "load more", now stale

    expect(result.current.columns.applied.items.map((c) => c.id)).toEqual([5, 1]);
    expect(result.current.loadingMore.applied).toBe(false);
  });

  it('reports a failed column load through onError', async () => {
    const onError = vi.fn();
    renderHook(() => useBoard(1, onError));
    await act(async () => {
      for (const p of pending.splice(0)) p.fail(503);
    });
    await waitFor(() => expect(onError).toHaveBeenCalledWith('boom 503'));
  });
});
