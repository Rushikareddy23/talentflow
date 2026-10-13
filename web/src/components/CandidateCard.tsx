import { Candidate } from '../api';

export function scoreTone(score: number | null): 'none' | 'low' | 'mid' | 'high' {
  if (score === null) return 'none';
  if (score >= 75) return 'high';
  if (score >= 50) return 'mid';
  return 'low';
}

interface Props {
  candidate: Candidate;
  onOpen: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}

export function CandidateCard({ candidate: c, onOpen, onDragStart, onDragEnd }: Props) {
  return (
    <article
      className="card"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      tabIndex={0}
      aria-label={`${c.name}, score ${c.score ?? 'not scored'}`}
    >
      <div className="card-head">
        <strong>{c.name}</strong>
        <span className={`score ${scoreTone(c.score)}`} title={c.scoreMethod ? `Scored by ${c.scoreMethod}` : 'Not scored'}>
          {c.score ?? '–'}
        </span>
      </div>
      <div className="muted small">{c.email}</div>
      {c.missingSkills.length > 0 && (
        <div className="small missing">Missing: {c.missingSkills.slice(0, 3).join(', ')}</div>
      )}
    </article>
  );
}
