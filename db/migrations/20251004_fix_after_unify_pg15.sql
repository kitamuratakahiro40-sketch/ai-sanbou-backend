BEGIN;

-- 1) jobs: status_detail 追加
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS status_detail TEXT;

-- 2) chunks.id と一意制約
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='chunks' AND column_name='id'
  ) THEN
    ALTER TABLE chunks ADD COLUMN id BIGSERIAL;
    ALTER TABLE chunks ADD CONSTRAINT chunks_id_key UNIQUE (id);
  END IF;
END $$;

-- 3) 必須カラムの追加
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS retry_count   INTEGER DEFAULT 0;
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS payload_json  JSONB   NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS start_ms      INTEGER;
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS end_ms        INTEGER;

-- 4) ms バックフィル（start_sec/end_sec がある場合）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='chunks' AND column_name='start_sec') THEN
    UPDATE chunks SET start_ms = start_sec * 1000 WHERE start_ms IS NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='chunks' AND column_name='end_sec') THEN
    UPDATE chunks SET end_ms = end_sec * 1000 WHERE end_ms IS NULL;
  END IF;
END $$;

-- 5) error / error_msg の統合
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='chunks' AND column_name='error') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name='chunks' AND column_name='error_msg') THEN
      UPDATE chunks SET error_msg = COALESCE(error_msg, error) WHERE error IS NOT NULL;
      ALTER TABLE chunks DROP COLUMN error;
    ELSE
      ALTER TABLE chunks RENAME COLUMN error TO error_msg;
    END IF;
  END IF;
END $$;

-- 6) ステータス正規化
UPDATE jobs   SET status = 'RUNNING' WHERE status = 'PROCESSING';
UPDATE chunks SET status = 'RUNNING' WHERE status = 'PROCESSING';
UPDATE chunks SET status = 'DONE'    WHERE status = 'COMPLETED';

-- 7) (job_id, idx) の一意制約が無ければ付与（PG15対応）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chunks_job_idx_key'
      AND conrelid = 'public.chunks'::regclass
  ) THEN
    ALTER TABLE chunks ADD CONSTRAINT chunks_job_idx_key UNIQUE (job_id, idx);
  END IF;
END $$;

COMMIT;
