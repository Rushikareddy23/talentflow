import { STAGES } from '../db/migrations';

export type Stage = (typeof STAGES)[number];
export { STAGES };

/**
 * Hiring pipeline rules, kept as pure data + functions so they are trivial to unit test.
 *  - Candidates move forward one step at a time, or back one step (to undo a mistake).
 *  - Any active candidate can be rejected.
 *  - A rejected candidate can be reopened to 'screening'.
 *  - 'hired' is terminal.
 */
const FLOW: Stage[] = ['applied', 'screening', 'interview', 'offer', 'hired'];

export function allowedNextStages(from: Stage): Stage[] {
  if (from === 'hired') return [];
  if (from === 'rejected') return ['screening'];
  const i = FLOW.indexOf(from);
  const next: Stage[] = [];
  if (i > 0) next.push(FLOW[i - 1]);
  next.push(FLOW[i + 1]);
  next.push('rejected');
  return next;
}

export function canTransition(from: Stage, to: Stage): boolean {
  return allowedNextStages(from).includes(to);
}
