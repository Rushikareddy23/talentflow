import { useCallback, useEffect, useRef, useState } from 'react';
import { api, Candidate, Page, Stage, STAGES } from './api';

export type Columns = Record<Stage, Page<Candidate>>;

export const emptyColumns = (): Columns =>
  Object.fromEntries(STAGES.map((s) => [s, { items: [], nextCursor: null }])) as unknown as Columns;

/** Appends a page to a column, skipping any candidate already shown (by id). */
export function appendUnique(existing: Candidate[], incoming: Candidate[]): Candidate[] {
  const seen = new Set(existing.map((c) => c.id));
  return [...existing, ...incoming.filter((c) => !seen.has(c.id))];
}

/**
 * Loads and paginates the Kanban columns for one job, safely under concurrency.
 *
 * Responses can arrive out of order (switching jobs quickly, reloading a column while "Load more"
 * is in flight). Each request remembers the job and the column "generation" it was issued for, and
 * its result is dropped if either has changed by the time it arrives:
 *  - jobRef: the job currently on screen. A late response for the previous job is ignored.
 *  - generation[stage]: bumped on every reload of that column, so an older reload or a
 *    "Load more" started before the reload can't overwrite or append to the fresh data.
 */
export function useBoard(jobId: number | null, onError: (message: string) => void) {
  const [columns, setColumns] = useState<Columns>(emptyColumns);
  const [loadingMore, setLoadingMore] = useState<Partial<Record<Stage, boolean>>>({});

  const jobRef = useRef(jobId);
  const generation = useRef<Record<Stage, number>>(Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<Stage, number>);
  const inFlightMore = useRef(new Map<Stage, symbol>()); // stage -> token of the running "Load more"
  const columnsRef = useRef(columns);
  columnsRef.current = columns;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const reload = useCallback(async (stages: readonly Stage[] = STAGES) => {
    const forJob = jobRef.current;
    if (forJob === null) return;
    const issued = stages.map((s) => ++generation.current[s]);
    // A reload supersedes any "Load more" running on these columns; its result will be discarded.
    for (const s of stages) inFlightMore.current.delete(s);
    setLoadingMore((m) => ({ ...m, ...Object.fromEntries(stages.map((s) => [s, false])) }));

    const results = await Promise.allSettled(stages.map((s) => api.listCandidates(forJob, s)));
    if (jobRef.current !== forJob) return; // user switched jobs meanwhile

    const fresh: Partial<Columns> = {};
    let firstError: string | null = null;
    stages.forEach((s, i) => {
      const r = results[i];
      if (generation.current[s] !== issued[i]) return; // a newer reload of this column exists
      if (r.status === 'fulfilled') fresh[s] = r.value;
      else firstError ??= (r.reason as Error).message;
    });
    setColumns((prev) => ({ ...prev, ...fresh }));
    if (firstError) onErrorRef.current(firstError);
  }, []);

  // Switching jobs: clear the board immediately, invalidate everything in flight, load the new job.
  useEffect(() => {
    jobRef.current = jobId;
    for (const s of STAGES) generation.current[s]++;
    inFlightMore.current.clear();
    setLoadingMore({});
    setColumns(emptyColumns());
    void reload();
  }, [jobId, reload]);

  const loadMore = useCallback(async (stage: Stage) => {
    const forJob = jobRef.current;
    const cursor = columnsRef.current[stage].nextCursor;
    if (forJob === null || !cursor || inFlightMore.current.has(stage)) return; // ignore repeat clicks
    const gen = generation.current[stage];
    const token = Symbol(stage);
    inFlightMore.current.set(stage, token);
    setLoadingMore((m) => ({ ...m, [stage]: true }));
    const stillCurrent = () => jobRef.current === forJob && generation.current[stage] === gen;
    try {
      const page = await api.listCandidates(forJob, stage, cursor);
      if (!stillCurrent()) return; // the board was reloaded or the job changed meanwhile
      setColumns((prev) => ({
        ...prev,
        [stage]: { items: appendUnique(prev[stage].items, page.items), nextCursor: page.nextCursor },
      }));
    } catch (e) {
      if (stillCurrent()) onErrorRef.current(`Could not load more candidates: ${(e as Error).message}`);
    } finally {
      // Release the guard only if it is still ours (a reload or job switch may have replaced it).
      if (inFlightMore.current.get(stage) === token) {
        inFlightMore.current.delete(stage);
        setLoadingMore((m) => ({ ...m, [stage]: false }));
      }
    }
  }, []);

  return { columns, loadingMore, reload, loadMore };
}
