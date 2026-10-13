import { z } from 'zod';

export const createJobSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(20_000),
  requiredSkills: z
    .array(z.string().trim().min(1).max(50))
    .max(30)
    .default([])
    // de-duplicate case-insensitively, keeping the first spelling
    .transform((skills) => {
      const seen = new Set<string>();
      return skills.filter((s) => !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()));
    }),
});
export type CreateJobDto = z.infer<typeof createJobSchema>;

export interface JobRow {
  id: string;
  title: string;
  description: string;
  required_skills: string[];
  created_at: Date;
}

export function toJob(row: JobRow) {
  return {
    id: Number(row.id),
    title: row.title,
    description: row.description,
    requiredSkills: row.required_skills,
    createdAt: row.created_at,
  };
}
export type Job = ReturnType<typeof toJob>;
