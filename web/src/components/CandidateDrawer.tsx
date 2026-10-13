import { useCallback, useEffect, useRef, useState } from 'react';
import { api, CandidateDetail, CandidateEvent, Stage } from '../api';
import { scoreTone } from './CandidateCard';

interface Props {
  candidateId: number;
  onClose: () => void;
  onChanged: (stages: Stage[]) => void;
  onError: (message: string) => void;
}

function describe(e: CandidateEvent): string {
  if (e.type === 'created') return 'Applied';
  if (e.type === 'stage_changed') return `Moved ${e.fromStage} → ${e.toStage}`;
  return `Scored ${String(e.payload.score)} (${String(e.payload.method)})`;
}

/** Side panel with the AI score explanation, stage actions and the full audit history. */
export function CandidateDrawer({ candidateId, onClose, onChanged, onError }: Props) {
  const [c, setC] = useState<CandidateDetail | null>(null);
  const [events, setEvents] = useState<CandidateEvent[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [detail, history] = await Promise.all([api.getCandidate(candidateId), api.events(candidateId)]);
    setC(detail);
    setEvents(history);
  }, [candidateId]);

  // Keep the latest onError in a ref so a new callback from the parent doesn't re-trigger loading.
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    load().catch((e) => onErrorRef.current((e as Error).message));
  }, [load]);

  async function act(fn: () => Promise<unknown>, stages: Stage[]) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      await load().catch(() => undefined);
      onChanged(stages);
      setBusy(false);
    }
  }

  return (
    <aside className="drawer" aria-label="Candidate details">
      <div className="modal-head">
        <h2>{c?.name ?? 'Loading…'}</h2>
        <button className="icon" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      {c && (
        <div className="drawer-body">
          <p className="muted">{c.email}</p>

          <div className="score-block">
            <span className={`score big ${scoreTone(c.score)}`}>{c.score ?? '–'}</span>
            <div>
              <div className="small muted">
                {c.scoreMethod ? `Fit score · ${c.scoreMethod === 'llm' ? 'AI model' : 'keyword fallback'}` : 'Not scored yet'}
              </div>
              <p>{c.scoreSummary}</p>
            </div>
          </div>

          {(c.matchedSkills.length > 0 || c.missingSkills.length > 0) && (
            <div className="skills">
              {c.matchedSkills.map((s) => (
                <span key={s} className="chip ok">
                  ✓ {s}
                </span>
              ))}
              {c.missingSkills.map((s) => (
                <span key={s} className="chip miss">
                  ✗ {s}
                </span>
              ))}
            </div>
          )}

          <h4>Move to</h4>
          <div className="stage-actions">
            {c.allowedNextStages.length === 0 && <span className="muted small">Final stage</span>}
            {c.allowedNextStages.map((s) => (
              <button
                key={s}
                className={s === 'rejected' ? 'danger' : 'secondary'}
                disabled={busy}
                onClick={() => act(() => api.moveStage(c.id, s, c.version), [c.stage, s])}
              >
                {s}
              </button>
            ))}
            <button className="secondary" disabled={busy} onClick={() => act(() => api.score(c.id), [c.stage])}>
              Re-score
            </button>
          </div>

          <h4>History</h4>
          <ol className="timeline">
            {events.map((e) => (
              <li key={e.id}>
                <span>{describe(e)}</span>
                <time className="muted small">{new Date(e.createdAt).toLocaleString()}</time>
              </li>
            ))}
          </ol>

          <details>
            <summary>Resume text</summary>
            <pre className="resume">{c.resumeText}</pre>
          </details>
        </div>
      )}
    </aside>
  );
}
