import { ScoreInput, ScoreResult } from './score.schema';

/**
 * Deterministic fallback scorer used when no LLM is configured or the LLM fails.
 * Score = percentage of required skills found in the resume, matched on word boundaries
 * with a few common aliases (so "Postgres" counts for "PostgreSQL", "Node" for "Node.js").
 */
const ALIASES: Record<string, string[]> = {
  'node.js': ['node.js', 'nodejs', 'node'],
  postgresql: ['postgresql', 'postgres', 'psql'],
  typescript: ['typescript', 'ts'],
  javascript: ['javascript', 'js', 'es6'],
  react: ['react', 'react.js', 'reactjs'],
  aws: ['aws', 'amazon web services'],
  kubernetes: ['kubernetes', 'k8s'],
  'ci/cd': ['ci/cd', 'cicd', 'github actions', 'continuous integration'],
  nestjs: ['nestjs', 'nest.js'],
  rest: ['rest', 'restful', 'rest api'],
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Word-boundary match that also works for terms with symbols, like "c++" or "node.js". */
export function mentions(text: string, term: string): boolean {
  const re = new RegExp(`(^|[^a-z0-9+#])${escapeRegex(term.toLowerCase())}(?![a-z0-9+#])`, 'i');
  return re.test(text);
}

export function keywordScore(input: ScoreInput): ScoreResult {
  const text = input.resumeText.toLowerCase();
  const matched: string[] = [];
  const missing: string[] = [];

  for (const skill of input.requiredSkills) {
    const variants = ALIASES[skill.toLowerCase()] ?? [skill.toLowerCase()];
    (variants.some((v) => mentions(text, v)) ? matched : missing).push(skill);
  }

  const total = input.requiredSkills.length;
  const score = total === 0 ? 0 : Math.round((matched.length / total) * 100);
  const summary =
    total === 0
      ? 'The job lists no required skills, so a keyword match score cannot be computed.'
      : `Keyword match: ${matched.length} of ${total} required skills found in the resume.`;

  return { score, summary, matchedSkills: matched, missingSkills: missing, method: 'keyword' };
}
