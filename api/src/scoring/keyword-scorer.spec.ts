import { keywordScore, mentions } from './keyword-scorer';

const base = { jobTitle: 'SWE', jobDescription: 'Build things' };

describe('mentions', () => {
  it('matches whole words only', () => {
    expect(mentions('i write java daily', 'java')).toBe(true);
    expect(mentions('i write javascript daily', 'java')).toBe(false);
  });

  it('handles skills containing symbols', () => {
    expect(mentions('firmware in c++ and python', 'c++')).toBe(true);
    expect(mentions('apis in node.js', 'node.js')).toBe(true);
    expect(mentions('c# developer', 'c#')).toBe(true);
  });

  it('does not treat c++ as a match for c', () => {
    expect(mentions('expert in c++', 'c')).toBe(false);
  });
});

describe('keywordScore', () => {
  it('scores the share of required skills found, using aliases', () => {
    const r = keywordScore({
      ...base,
      requiredSkills: ['React', 'Node.js', 'PostgreSQL', 'AWS'],
      resumeText: 'Built a React dashboard backed by Postgres and a Node API.',
    });
    expect(r.score).toBe(75);
    expect(r.matchedSkills).toEqual(['React', 'Node.js', 'PostgreSQL']);
    expect(r.missingSkills).toEqual(['AWS']);
    expect(r.method).toBe('keyword');
  });

  it('returns 0 with an explanation when the job has no required skills', () => {
    const r = keywordScore({ ...base, requiredSkills: [], resumeText: 'anything at all here' });
    expect(r.score).toBe(0);
    expect(r.summary).toMatch(/no required skills/);
  });

  it('is case-insensitive', () => {
    const r = keywordScore({ ...base, requiredSkills: ['typescript'], resumeText: 'TYPESCRIPT everywhere' });
    expect(r.score).toBe(100);
  });
});
