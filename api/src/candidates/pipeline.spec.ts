import { allowedNextStages, canTransition, STAGES } from './pipeline';

describe('pipeline transitions', () => {
  it('moves forward one stage at a time', () => {
    expect(canTransition('applied', 'screening')).toBe(true);
    expect(canTransition('screening', 'interview')).toBe(true);
    expect(canTransition('interview', 'offer')).toBe(true);
    expect(canTransition('offer', 'hired')).toBe(true);
  });

  it('does not allow skipping stages', () => {
    expect(canTransition('applied', 'interview')).toBe(false);
    expect(canTransition('applied', 'hired')).toBe(false);
    expect(canTransition('screening', 'offer')).toBe(false);
  });

  it('allows stepping back one stage to undo a mistake', () => {
    expect(canTransition('interview', 'screening')).toBe(true);
    expect(canTransition('offer', 'interview')).toBe(true);
    expect(canTransition('offer', 'screening')).toBe(false);
  });

  it('allows rejecting from any active stage', () => {
    for (const s of ['applied', 'screening', 'interview', 'offer'] as const) {
      expect(canTransition(s, 'rejected')).toBe(true);
    }
  });

  it('treats hired as terminal', () => {
    expect(allowedNextStages('hired')).toEqual([]);
    expect(canTransition('hired', 'rejected')).toBe(false);
  });

  it('lets a rejected candidate be reopened only to screening', () => {
    expect(allowedNextStages('rejected')).toEqual(['screening']);
  });

  it('never allows a no-op transition to the same stage', () => {
    for (const s of STAGES) expect(canTransition(s, s)).toBe(false);
  });
});
