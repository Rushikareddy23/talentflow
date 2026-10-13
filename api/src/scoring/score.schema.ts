import { z } from 'zod';

/** The exact JSON shape the LLM must return. Anything else is rejected and retried / falls back. */
export const llmScoreSchema = z.object({
  score: z.number().int().min(0).max(100),
  summary: z.string().trim().min(1).max(600),
  matchedSkills: z.array(z.string().trim().min(1).max(60)).max(30),
  missingSkills: z.array(z.string().trim().min(1).max(60)).max(30),
});
export type LlmScore = z.infer<typeof llmScoreSchema>;

export interface ScoreInput {
  jobTitle: string;
  jobDescription: string;
  requiredSkills: string[];
  resumeText: string;
}

export interface ScoreResult extends LlmScore {
  method: 'llm' | 'keyword';
}
