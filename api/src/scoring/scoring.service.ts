import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../config';
import { logger } from '../observability/logger';
import { llmDuration, llmFailures, scoringTotal } from '../observability/metrics';
import { keywordScore } from './keyword-scorer';
import { LlmClient, LlmError } from './llm.client';
import { ScoreInput, ScoreResult } from './score.schema';

export const LLM_CLIENT = Symbol('LLM_CLIENT');

/**
 * Scores a resume against a job.
 * Tries the LLM up to `maxAttempts` times (timeouts, HTTP errors and malformed JSON are all retryable),
 * then falls back to the deterministic keyword scorer, so scoring never fails outright.
 * The result records which method produced it.
 */
@Injectable()
export class ScoringService {
  constructor(
    @Inject(LLM_CLIENT) private readonly llm: LlmClient | null,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async score(input: ScoreInput): Promise<ScoreResult> {
    if (this.llm) {
      for (let attempt = 1; attempt <= this.config.llm.maxAttempts; attempt++) {
        const stop = llmDuration.startTimer();
        try {
          const result = await this.llm.score(input);
          stop();
          scoringTotal.inc({ method: 'llm' });
          return { ...result, method: 'llm' };
        } catch (err) {
          stop();
          const reason = err instanceof LlmError ? err.reason : 'unknown';
          llmFailures.inc({ reason });
          logger.write('warn', 'llm_scoring_failed', { attempt, reason, error: (err as Error).message });
          if (attempt < this.config.llm.maxAttempts) await sleep(250 * 2 ** (attempt - 1));
        }
      }
    }
    scoringTotal.inc({ method: 'keyword' });
    return keywordScore(input);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, process.env.NODE_ENV === 'test' ? 0 : ms));
}
