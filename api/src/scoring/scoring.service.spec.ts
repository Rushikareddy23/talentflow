import { loadConfig } from '../config';
import { LlmClient, LlmError } from './llm.client';
import { ScoringService } from './scoring.service';

process.env.NODE_ENV = 'test';

const input = {
  jobTitle: 'SWE',
  jobDescription: 'Full-stack role',
  requiredSkills: ['React', 'Node.js'],
  resumeText: 'Built React apps.',
};
const llmResult = { score: 70, summary: 'Good React, no Node.', matchedSkills: ['React'], missingSkills: ['Node.js'] };

function fakeLlm(...outcomes: Array<'ok' | LlmError>) {
  const score = jest.fn();
  for (const o of outcomes) {
    if (o === 'ok') score.mockResolvedValueOnce(llmResult);
    else score.mockRejectedValueOnce(o);
  }
  return { score } as unknown as LlmClient & { score: jest.Mock };
}

const config = loadConfig({ LLM_MAX_ATTEMPTS: '2' });

describe('ScoringService', () => {
  it('uses the LLM result when the LLM succeeds', async () => {
    const llm = fakeLlm('ok');
    const r = await new ScoringService(llm, config).score(input);
    expect(r).toEqual({ ...llmResult, method: 'llm' });
    expect(llm.score).toHaveBeenCalledTimes(1);
  });

  it('retries once after a malformed reply, then succeeds', async () => {
    const llm = fakeLlm(new LlmError('invalid_json', 'bad'), 'ok');
    const r = await new ScoringService(llm, config).score(input);
    expect(r.method).toBe('llm');
    expect(llm.score).toHaveBeenCalledTimes(2);
  });

  it('falls back to keyword scoring after all attempts fail', async () => {
    const llm = fakeLlm(new LlmError('timeout', 't'), new LlmError('http', 'h'));
    const r = await new ScoringService(llm, config).score(input);
    expect(r.method).toBe('keyword');
    expect(r.score).toBe(50);
    expect(llm.score).toHaveBeenCalledTimes(2);
  });

  it('uses keyword scoring directly when no LLM is configured', async () => {
    const r = await new ScoringService(null, config).score(input);
    expect(r.method).toBe('keyword');
  });
});
