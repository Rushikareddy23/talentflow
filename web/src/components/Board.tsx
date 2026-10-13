import { useState } from 'react';
import { Candidate, Page, Stage, STAGES } from '../api';
import { CandidateCard } from './CandidateCard';

const LABELS: Record<Stage, string> = {
  applied: 'Applied',
  screening: 'Screening',
  interview: 'Interview',
  offer: 'Offer',
  hired: 'Hired',
  rejected: 'Rejected',
};

interface Props {
  columns: Record<Stage, Page<Candidate>>;
  loadingMore: Partial<Record<Stage, boolean>>;
  onMove: (candidate: Candidate, to: Stage) => void;
  onOpen: (id: number) => void;
  onLoadMore: (stage: Stage) => void;
}

/** Kanban board: drag a card to another column to move the candidate to that stage. */
export function Board({ columns, loadingMore, onMove, onOpen, onLoadMore }: Props) {
  const [dragging, setDragging] = useState<Candidate | null>(null);
  const [over, setOver] = useState<Stage | null>(null);

  return (
    <main className="board">
      {STAGES.map((stage) => (
        <section
          key={stage}
          className={`column ${over === stage ? 'drop-target' : ''}`}
          onDragOver={(e) => {
            if (!dragging) return;
            e.preventDefault();
            setOver(stage);
          }}
          onDragLeave={() => setOver((s) => (s === stage ? null : s))}
          onDrop={(e) => {
            e.preventDefault();
            setOver(null);
            if (dragging) onMove(dragging, stage);
            setDragging(null);
          }}
        >
          <h3>
            {LABELS[stage]}
            <span className="count">{columns[stage].items.length}{columns[stage].nextCursor ? '+' : ''}</span>
          </h3>
          <div className="cards">
            {columns[stage].items.map((c) => (
              <CandidateCard
                key={c.id}
                candidate={c}
                onOpen={() => onOpen(c.id)}
                onDragStart={() => setDragging(c)}
                onDragEnd={() => setDragging(null)}
              />
            ))}
            {columns[stage].items.length === 0 && <p className="muted small">No candidates</p>}
          </div>
          {columns[stage].nextCursor && (
            <button className="link" disabled={!!loadingMore[stage]} onClick={() => onLoadMore(stage)}>
              {loadingMore[stage] ? 'Loading…' : 'Load more'}
            </button>
          )}
        </section>
      ))}
    </main>
  );
}
