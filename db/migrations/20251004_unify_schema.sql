BEGIN;

-- jobs.id が uuid なら text に寄せる（chunks 側も合わせる）
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='jobs' AND column_name='id' AND data_type='uuid'
  ) THEN
    ALTER TABLE jobs ALTER COLUMN id TYPE TEXT USING id::text;
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='chunks' AND column_name='job_id' AND data_type='uuid'
  ) THEN
    ALTER TABLE chunks ALTER COLUMN job_id TYPE TEXT USING job_id::text;
  END IF;
END$$;

-- jobs.status の正規化（PENDING/RUNNING/COMPLETED/FAILED）
ALTER TABLE jobs ALTER COLUMN status TYPE TEXT;
UPDATE jobs SET status='RUNNING'  WHERE status IN ('PROCESSING');
UPDATE jobs SET status='PENDING'  WHERE status IS NULL;

-- jobs.status_detail 追加
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS status_detail TEXT;

-- chunks.id（単独ID）を保証
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='chunks' AND column_name='id'
  ) THEN
    ALTER TABLE chunks ADD COLUMN id BIGSERIAL;
    ALTER TABLE chunks ADD CONSTRAINT chunks_id_key UNIQUE (id);
  END IF;
END$$;

-- 列名を現行コードに合わせる
-- error -> error_msg
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='chunks' AND column_name='error') THEN
    ALTER TABLE chunks RENAME COLUMN error TO error_msg;
  END IF;
END$$;

-- 必須列の追加
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS text         TEXT;
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS retry_count  INTEGER DEFAULT 0;
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS payload_json JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 時間単位：ms 列を用意し、sec があればバックフィル
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='chunks' AND column_name='start_ms') THEN
    ALTER TABLE chunks ADD COLUMN start_ms INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='chunks' AND column_name='end_ms') THEN
    ALTER TABLE chunks ADD COLUMN end_ms INTEGER;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='chunks' AND column_name='start_sec') THEN
    UPDATE chunks SET start_ms = start_sec * 1000 WHERE start_ms IS NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='chunks' AND column_name='end_sec') THEN
    UPDATE chunks SET end_ms = end_sec * 1000 WHERE end_ms IS NULL;
  END IF;
END$$;

-- ステータス正規化（PENDING/RUNNING/DONE/FAILED）
ALTER TABLE chunks ALTER COLUMN status TYPE TEXT;
UPDATE chunks SET status='RUNNING' WHERE status IN ('PROCESSING');
UPDATE chunks SET status='DONE'    WHERE status IN ('COMPLETED');

-- 一意制約 (job_id, idx) は維持（なければ作成）
ALTER TABLE chunks
  ADD CONSTRAINT IF NOT EXISTS chunks_job_idx_key UNIQUE (job_id, idx);

-- transcripts のタイムスタンプ列を整備（無ければ追加）
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- updated_at 自動更新トリガ
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_jobs_touch') THEN
    CREATE TRIGGER trg_jobs_touch BEFORE UPDATE ON jobs
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_chunks_touch') THEN
    CREATE TRIGGER trg_chunks_touch BEFORE UPDATE ON chunks
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_transcripts_touch') THEN
    CREATE TRIGGER trg_transcripts_touch BEFORE UPDATE ON transcripts
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
  END IF;
END$$;

COMMIT;
