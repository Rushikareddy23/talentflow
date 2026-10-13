import { FormEvent, useState } from 'react';
import { api, Candidate, Job } from '../api';
import { Modal } from './Modal';

interface Props {
  job: Job;
  onClose: () => void;
  onCreated: (candidate: Candidate) => void;
}

/** Adds a candidate, then immediately scores their resume against the job. */
export function NewCandidateForm({ job, onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [resumeText, setResumeText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'scoring'>('idle');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      setStatus('saving');
      const created = await api.createCandidate(job.id, { name, email, resumeText });
      setStatus('scoring');
      // If scoring fails the candidate still exists; they just show as unscored.
      const scored = await api.score(created.id).catch(() => created);
      onCreated(scored);
    } catch (err) {
      setError((err as Error).message);
      setStatus('idle');
    }
  }

  return (
    <Modal title={`Add candidate to “${job.title}”`} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <div className="row">
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </label>
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
        </div>
        <label>
          Resume text
          <textarea
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            required
            minLength={20}
            rows={10}
            placeholder="Paste the resume as plain text"
          />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={status !== 'idle'}>
            {status === 'saving' ? 'Saving…' : status === 'scoring' ? 'Scoring resume…' : 'Add & score'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
