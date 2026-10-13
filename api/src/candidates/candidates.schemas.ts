import { z } from 'zod';
import { STAGES } from './pipeline';

export const createCandidateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().toLowerCase().email().max(320),
  resumeText: z.string().trim().min(20, 'resume text looks too short').max(50_000),
});
export type CreateCandidateDto = z.infer<typeof createCandidateSchema>;

export const moveStageSchema = z.object({
  stage: z.enum(STAGES),
  /** The version the client last saw; the move fails with 409 if someone else changed the candidate since. */
  version: z.number().int().positive(),
});
export type MoveStageDto = z.infer<typeof moveStageSchema>;

export const listCandidatesSchema = z.object({
  stage: z.enum(STAGES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().max(100).optional(),
});
export type ListCandidatesQuery = z.infer<typeof listCandidatesSchema>;

export interface CandidateRow {
  id: string;
  job_id: string;
  name: string;
  email: string;
  resume_text: string;
  stage: (typeof STAGES)[number];
  score: number | null;
  score_summary: string | null;
  score_method: 'llm' | 'keyword' | null;
  matched_skills: string[];
  missing_skills: string[];
  scored_at: Date | null;
  version: number;
  created_at: Date;
  updated_at: Date;
}

export function toCandidate(row: CandidateRow, opts: { includeResume?: boolean } = {}) {
  return {
    id: Number(row.id),
    jobId: Number(row.job_id),
    name: row.name,
    email: row.email,
    stage: row.stage,
    score: row.score,
    scoreSummary: row.score_summary,
    scoreMethod: row.score_method,
    matchedSkills: row.matched_skills,
    missingSkills: row.missing_skills,
    scoredAt: row.scored_at,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(opts.includeResume ? { resumeText: row.resume_text } : {}),
  };
}
