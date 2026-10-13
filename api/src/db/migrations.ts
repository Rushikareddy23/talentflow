/**
 * Schema migrations, applied in order and recorded in `schema_migrations`.
 * Each migration runs inside its own transaction, so a failed migration leaves no partial schema.
 * Never edit a migration that has shipped; add a new one instead.
 */
export interface Migration {
  id: string;
  sql: string;
}

export const STAGES = ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'] as const;

const stageList = STAGES.map((s) => `'${s}'`).join(', ');

export const migrations: Migration[] = [
  {
    id: '001_init',
    sql: `
      CREATE TABLE jobs (
        id              BIGSERIAL PRIMARY KEY,
        title           TEXT        NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
        description     TEXT        NOT NULL,
        required_skills TEXT[]      NOT NULL DEFAULT '{}',
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE candidates (
        id             BIGSERIAL PRIMARY KEY,
        job_id         BIGINT      NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        name           TEXT        NOT NULL,
        email          TEXT        NOT NULL,
        resume_text    TEXT        NOT NULL,
        stage          TEXT        NOT NULL DEFAULT 'applied' CHECK (stage IN (${stageList})),
        score          SMALLINT    CHECK (score BETWEEN 0 AND 100),
        score_summary  TEXT,
        score_method   TEXT        CHECK (score_method IN ('llm', 'keyword')),
        matched_skills TEXT[]      NOT NULL DEFAULT '{}',
        missing_skills TEXT[]      NOT NULL DEFAULT '{}',
        scored_at      TIMESTAMPTZ,
        version        INTEGER     NOT NULL DEFAULT 1,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
        -- The same person cannot apply twice to the same job.
        CONSTRAINT candidates_job_email_unique UNIQUE (job_id, email)
      );

      -- Append-only audit trail: every create, stage move and score is recorded.
      CREATE TABLE candidate_events (
        id           BIGSERIAL PRIMARY KEY,
        candidate_id BIGINT      NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
        type         TEXT        NOT NULL CHECK (type IN ('created', 'stage_changed', 'scored')),
        from_stage   TEXT,
        to_stage     TEXT,
        payload      JSONB       NOT NULL DEFAULT '{}',
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX candidate_events_candidate_idx ON candidate_events (candidate_id, id);
    `,
  },
  {
    id: '002_candidate_board_index',
    // Serves the hottest query: "candidates for job X in stage Y, best score first, page by page".
    // The sort key is an expression so unscored candidates (NULL) sort last without a NULLS LAST clause,
    // which lets keyset pagination use a simple row comparison on (sort_score, id).
    sql: `
      CREATE INDEX candidates_board_idx
        ON candidates (job_id, stage, (COALESCE(score, -1)), id);
    `,
  },
];
