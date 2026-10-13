import { Injectable, NotFoundException } from '@nestjs/common';
import { Database } from '../db/db.module';
import { STAGES } from '../db/migrations';
import { CreateJobDto, JobRow, toJob } from './jobs.schemas';

@Injectable()
export class JobsService {
  constructor(private readonly db: Database) {}

  async create(dto: CreateJobDto) {
    const [row] = await this.db.query<JobRow>(
      `INSERT INTO jobs (title, description, required_skills) VALUES ($1, $2, $3) RETURNING *`,
      [dto.title, dto.description, dto.requiredSkills],
    );
    return toJob(row);
  }

  async list() {
    const rows = await this.db.query<JobRow>(`SELECT * FROM jobs ORDER BY id DESC LIMIT 100`);
    return rows.map(toJob);
  }

  async get(id: number) {
    const [row] = await this.db.query<JobRow>(`SELECT * FROM jobs WHERE id = $1`, [id]);
    if (!row) throw new NotFoundException(`Job ${id} not found`);
    return toJob(row);
  }

  /** Candidate count per pipeline stage in one GROUP BY, with zero-filled stages. */
  async stageCounts(id: number) {
    await this.get(id);
    const rows = await this.db.query<{ stage: string; count: string }>(
      `SELECT stage, count(*) AS count FROM candidates WHERE job_id = $1 GROUP BY stage`,
      [id],
    );
    const counts = Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<(typeof STAGES)[number], number>;
    for (const r of rows) counts[r.stage as (typeof STAGES)[number]] = Number(r.count);
    return counts;
  }
}
