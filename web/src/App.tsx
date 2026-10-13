import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, Candidate, Job, Stage } from './api';
import { Board } from './components/Board';
import { CandidateDrawer } from './components/CandidateDrawer';
import { NewCandidateForm } from './components/NewCandidateForm';
import { NewJobForm } from './components/NewJobForm';
import { useBoard } from './useBoard';

export default function App() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobId, setJobId] = useState<number | null>(null);
  const [modal, setModal] = useState<'job' | 'candidate' | null>(null);
  const [openCandidate, setOpenCandidate] = useState<number | null>(null);
  const [toast, setToast] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);

  const notify = useCallback((kind: 'error' | 'info', text: string) => {
    setToast({ kind, text });
    window.setTimeout(() => setToast((t) => (t?.text === text ? null : t)), 4000);
  }, []);
  const notifyError = useCallback((text: string) => notify('error', text), [notify]);

  const { columns, loadingMore, reload: loadColumns, loadMore } = useBoard(jobId, notifyError);

  const loadJobs = useCallback(async () => {
    try {
      const list = await api.listJobs();
      setJobs(list);
      setJobId((cur) => cur ?? list[0]?.id ?? null);
    } catch (e) {
      notify('error', `Could not reach the API: ${(e as Error).message}`);
    }
  }, [notify]);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  async function move(candidate: Candidate, to: Stage) {
    if (candidate.stage === to) return;
    try {
      await api.moveStage(candidate.id, to, candidate.version);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) notify('error', 'Someone else just moved this candidate. Board refreshed.');
      else notify('error', (e as Error).message);
    }
    await loadColumns([candidate.stage, to]);
  }

  const job = jobs.find((j) => j.id === jobId) ?? null;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>
            TF
          </span>
          TalentFlow
        </div>
        <select
          aria-label="Job"
          value={jobId ?? ''}
          onChange={(e) => setJobId(Number(e.target.value))}
          disabled={jobs.length === 0}
        >
          {jobs.length === 0 && <option value="">No jobs yet</option>}
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.title}
            </option>
          ))}
        </select>
        <div className="spacer" />
        <button className="secondary" onClick={() => setModal('job')}>
          New job
        </button>
        <button onClick={() => setModal('candidate')} disabled={!job}>
          Add candidate
        </button>
      </header>

      {job ? (
        <>
          <div className="job-meta">
            <span>Required skills:</span>
            {job.requiredSkills.length ? (
              job.requiredSkills.map((s) => (
                <span key={s} className="chip">
                  {s}
                </span>
              ))
            ) : (
              <em>none listed</em>
            )}
          </div>
          <Board
            columns={columns}
            loadingMore={loadingMore}
            onMove={move}
            onOpen={setOpenCandidate}
            onLoadMore={loadMore}
          />
        </>
      ) : (
        <div className="empty">
          <h2>Create your first job</h2>
          <p>Add a job with its required skills, then add candidates. Each resume is scored against the job automatically.</p>
          <button onClick={() => setModal('job')}>New job</button>
        </div>
      )}

      {modal === 'job' && (
        <NewJobForm
          onClose={() => setModal(null)}
          onCreated={async (j) => {
            setModal(null);
            await loadJobs();
            setJobId(j.id);
          }}
        />
      )}
      {modal === 'candidate' && job && (
        <NewCandidateForm
          job={job}
          onClose={() => setModal(null)}
          onCreated={async (c) => {
            setModal(null);
            notify('info', `${c.name} added and scored ${c.score ?? '-'} / 100`);
            await loadColumns(['applied']);
          }}
        />
      )}
      {openCandidate !== null && (
        <CandidateDrawer
          candidateId={openCandidate}
          onClose={() => setOpenCandidate(null)}
          onChanged={(stages) => loadColumns(stages)}
          onError={(msg) => notify('error', msg)}
        />
      )}
      {toast && <div className={`toast ${toast.kind}`}>{toast.text}</div>}
    </div>
  );
}
