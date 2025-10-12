-- === ベース：ジョブ ===
CREATE TABLE IF NOT EXISTS jobs (
  id            TEXT PRIMARY KEY,           -- jobId (uuid文字列)
  source_uri    TEXT NOT NULL,              -- gs://...
  duration_sec  INTEGER NOT NULL,
  chunk_sec     INTEGER NOT NULL,
  total_chunks  INTEGER NOT NULL,
  status        TEXT NOT NULL,              -- PROCESSING / COMPLETED / FAILED
  error_code    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);

-- updated_at 自動更新（Cloud SQL/PGでOK）
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_jobs_touch ON jobs;
CREATE TRIGGER trg_jobs_touch BEFORE UPDATE ON jobs
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- === チャンク ===
CREATE TABLE IF NOT EXISTS chunks (
  job_id      TEXT NOT NULL,
  idx         INTEGER NOT NULL,             -- 0..N-1
  start_sec   INTEGER NOT NULL,
  end_sec     INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'PENDING', -- PENDING / RUNNING / DONE / FAILED
  error_msg   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (job_id, idx),
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chunks_job ON chunks(job_id);
CREATE INDEX IF NOT EXISTS idx_chunks_job_status ON chunks(job_id, status);

DROP TRIGGER IF EXISTS trg_chunks_touch ON chunks;
CREATE TRIGGER trg_chunks_touch BEFORE UPDATE ON chunks
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- === 完全文（結合後） ===
CREATE TABLE IF NOT EXISTS transcripts (
  job_id      TEXT PRIMARY KEY,
  text        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

DROP TRIGGER IF EXISTS trg_transcripts_touch ON transcripts;
CREATE TRIGGER trg_transcripts_touch BEFORE UPDATE ON transcripts
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- === （将来用）チャンク逐語 ===
CREATE TABLE IF NOT EXISTS transcript_chunks (
  job_id        TEXT NOT NULL,
  idx           INTEGER NOT NULL,
  start_ms      INTEGER,
  end_ms        INTEGER,
  text          TEXT,
  speaker_map   JSONB,
  raw_json      JSONB,
  quality_score REAL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (job_id, idx),
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tchunks_job ON transcript_chunks(job_id);

DROP TRIGGER IF EXISTS trg_tchunks_touch ON transcript_chunks;
CREATE TRIGGER trg_tchunks_touch BEFORE UPDATE ON transcript_chunks
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- === 権限整備（appuser を実務オーナーに） ===
ALTER DATABASE scribe OWNER TO appuser;
ALTER SCHEMA public OWNER TO appuser;
ALTER TABLE jobs               OWNER TO appuser;
ALTER TABLE chunks             OWNER TO appuser;
ALTER TABLE transcripts        OWNER TO appuser;
ALTER TABLE transcript_chunks  OWNER TO appuser;

-- 既定権限（将来作成されるテーブル/シーケンスにも付与）
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO appuser;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO appuser;
