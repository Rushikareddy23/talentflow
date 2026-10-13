import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PoolClient } from 'pg';
import { PG_FOREIGN_KEY_VIOLATION, PG_UNIQUE_VIOLATION, pgCode } from '../common/pg-errors';
import { Database } from '../db/db.module';
import { logger } from '../observability/logger';
import { ScoringService } from '../scoring/scoring.service';
import {
  CandidateRow,
  CreateCandidateDto,
  ListCandidatesQuery,
  MoveStageDto,
  toCandidate,
} from './candidates.schemas';
import { decodeCursor, encodeCursor } from './cursor';
import { allowedNextStages, canTransition, Stage } from './pipeline';

// List views never need the (potentially large) resume text.
const LIST_COLUMNS = `id, job_id, name, email, '' AS resume_text, stage, score, score_summary, score_method,
  matched_skills, missing_skills, scored_at, version, created_at, updated_at`;

type EventType = 'created' | 'stage_changed' | 'scored';

@Injectable()
export class CandidatesService {
  constructor(
    private readonly db: Database,
    private readonly scoring: ScoringService,
  ) {}

  async create(jobId: number, dto: CreateCandidateDto) {
    try {
      return await this.db.tx(async (c) => {
        const { rows } = await c.query<CandidateRow>(
          `INSERT INTO candidates (job_id, name, email, resume_text) VALUES ($1, $2, $3, $4) RETURNING *`,
          [jobId, dto.name, dto.email, dto.resumeText],
        );
        await this.recordEvent(c, rows[0].id, 'created', null, 'applied');
        return toCandidate(rows[0]);
      });
    } catch (err) {
      if (pgCode(err) === PG_UNIQUE_VIOLATION) {
        throw new ConflictException(`${dto.email} has already applied to job ${jobId}`);
      }
      if (pgCode(err) === PG_FOREIGN_KEY_VIOLATION) throw new NotFoundException(`Job ${jobId} not found`);
      throw err;
    }
  }

  /**
   * One page of a job's candidates, best score first (unscored last), using keyset pagination.
   * With a stage filter this is a pure index range scan on candidates_board_idx.
   */
  async list(jobId: number, q: ListCandidatesQuery) {
    const params: unknown[] = [jobId];
    const where = ['job_id = $1'];
    if (q.stage) {
      params.push(q.stage);
      where.push(`stage = $${params.length}`);
    }
    if (q.cursor) {
      const cur = decodeCursor(q.cursor);
      if (!cur) throw new BadRequestException('Invalid cursor');
      params.push(cur.sortScore, cur.id);
      where.push(`(COALESCE(score, -1), id) < ($${params.length - 1}, $${params.length})`);
    }
    params.push(q.limit + 1); // fetch one extra row to know whether another page exists
    const rows = await this.db.query<CandidateRow>(
      `SELECT ${LIST_COLUMNS} FROM candidates
        WHERE ${where.join(' AND ')}
        ORDER BY COALESCE(score, -1) DESC, id DESC
        LIMIT $${params.length}`,
      params,
    );
    const hasMore = rows.length > q.limit;
    const page = hasMore ? rows.slice(0, q.limit) : rows;
    const last = page[page.length - 1];
    return {
      items: page.map((r) => toCandidate(r)),
      nextCursor: hasMore && last ? encodeCursor({ sortScore: last.score ?? -1, id: Number(last.id) }) : null,
    };
  }

  async get(id: number) {
    const row = await this.findRow(id);
    return { ...toCandidate(row, { includeResume: true }), allowedNextStages: allowedNextStages(row.stage) };
  }

  /**
   * Moves a candidate to a new stage with optimistic concurrency control:
   * the client sends the `version` it last saw, and the UPDATE only matches if nobody else
   * has moved the candidate since. Two recruiters dragging the same card at once -> one wins, one gets 409.
   */
  async moveStage(id: number, dto: MoveStageDto) {
    return this.db.tx(async (c) => {
      const { rows } = await c.query<CandidateRow>(`SELECT * FROM candidates WHERE id = $1`, [id]);
      const current = rows[0];
      if (!current) throw new NotFoundException(`Candidate ${id} not found`);
      if (current.version !== dto.version) {
        throw new ConflictException({
          message: 'Candidate was changed by someone else; reload and try again',
          currentVersion: current.version,
          currentStage: current.stage,
        });
      }
      if (!canTransition(current.stage, dto.stage)) {
        throw new UnprocessableEntityException({
          message: `Cannot move from ${current.stage} to ${dto.stage}`,
          allowedNextStages: allowedNextStages(current.stage),
        });
      }
      const updated = await c.query<CandidateRow>(
        `UPDATE candidates SET stage = $1, version = version + 1, updated_at = now()
          WHERE id = $2 AND version = $3
          RETURNING *`,
        [dto.stage, id, dto.version],
      );
      // Lost a race between our SELECT and UPDATE: the version guard matched zero rows.
      if (updated.rowCount === 0) throw new ConflictException('Candidate was changed by someone else; reload and try again');
      await this.recordEvent(c, id, 'stage_changed', current.stage, dto.stage);
      logger.write('info', 'candidate_stage_changed', { candidateId: id, from: current.stage, to: dto.stage });
      return toCandidate(updated.rows[0]);
    });
  }

  /** Scores the resume against its job. The (slow) LLM call happens outside any DB transaction. */
  async score(id: number) {
    const [row] = await this.db.query<CandidateRow & { title: string; description: string; required_skills: string[] }>(
      `SELECT c.*, j.title, j.description, j.required_skills
         FROM candidates c JOIN jobs j ON j.id = c.job_id
        WHERE c.id = $1`,
      [id],
    );
    if (!row) throw new NotFoundException(`Candidate ${id} not found`);

    const result = await this.scoring.score({
      jobTitle: row.title,
      jobDescription: row.description,
      requiredSkills: row.required_skills,
      resumeText: row.resume_text,
    });

    return this.db.tx(async (c) => {
      const { rows } = await c.query<CandidateRow>(
        `UPDATE candidates
            SET score = $1, score_summary = $2, score_method = $3, matched_skills = $4, missing_skills = $5,
                scored_at = now(), updated_at = now()
          WHERE id = $6
          RETURNING *`,
        [result.score, result.summary, result.method, result.matchedSkills, result.missingSkills, id],
      );
      if (!rows[0]) throw new NotFoundException(`Candidate ${id} not found`);
      await this.recordEvent(c, id, 'scored', null, null, { score: result.score, method: result.method });
      return toCandidate(rows[0]);
    });
  }

  async events(id: number) {
    await this.findRow(id);
    const rows = await this.db.query<{
      id: string;
      type: EventType;
      from_stage: Stage | null;
      to_stage: Stage | null;
      payload: Record<string, unknown>;
      created_at: Date;
    }>(`SELECT * FROM candidate_events WHERE candidate_id = $1 ORDER BY id`, [id]);
    return rows.map((r) => ({
      id: Number(r.id),
      type: r.type,
      fromStage: r.from_stage,
      toStage: r.to_stage,
      payload: r.payload,
      createdAt: r.created_at,
    }));
  }

  private async findRow(id: number): Promise<CandidateRow> {
    const [row] = await this.db.query<CandidateRow>(`SELECT * FROM candidates WHERE id = $1`, [id]);
    if (!row) throw new NotFoundException(`Candidate ${id} not found`);
    return row;
  }

  private async recordEvent(
    c: PoolClient,
    candidateId: string | number,
    type: EventType,
    from: Stage | null,
    to: Stage | null,
    payload: Record<string, unknown> = {},
  ) {
    await c.query(
      `INSERT INTO candidate_events (candidate_id, type, from_stage, to_stage, payload) VALUES ($1, $2, $3, $4, $5)`,
      [candidateId, type, from, to, payload],
    );
  }
}
