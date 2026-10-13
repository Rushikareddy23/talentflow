import { FormEvent, useState } from 'react';
import { api, Job, parseSkills } from '../api';
import { Modal } from './Modal';

export function NewJobForm({ onClose, onCreated }: { onClose: () => void; onCreated: (job: Job) => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [skills, setSkills] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      onCreated(await api.createJob({ title, description, requiredSkills: parseSkills(skills) }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="New job" onClose={onClose}>
      <form onSubmit={submit} className="form">
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} autoFocus />
        </label>
        <label>
          Required skills <span className="muted">(comma separated)</span>
          <input value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="React, Node.js, PostgreSQL, AWS" />
        </label>
        <label>
          Description
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} required rows={6} />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Create job'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
