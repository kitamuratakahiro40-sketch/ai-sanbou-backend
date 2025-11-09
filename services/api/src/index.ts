import express from 'express';
import bodyParser from 'body-parser';
import * as crypto from 'node:crypto';
import { Storage } from '@google-cloud/storage';

import { query } from './db.js';
import { downloadToTmp, ffprobeDurationSeconds } from './util.js';
import { planChunks } from './chunk.js';
import { enqueueTranscribeTask, enqueueChunkTask } from './tasks.js';

const app = express();
app.use(express.json ? express.json() : (req,res,next)=>next());
/** @health always-first */
app.use((req, res, next) => {
  if (req.path === '/healthz' || req.path === '/ping' || req.path === '/') {
    return res.status(200).send('ok');
  }
  next();
});
app.use(bodyParser.json());

// 既存の import などの下あたり
// ---------- Healthz ----------
app.head('/healthz', (_req, res) => res.status(200).end());
app.get('/healthz', (_req, res) => res.status(200).send('ok'));


// ========== 起動時：環境変数の厳格検証 ==========
const REQUIRED_ENVS = [
  'PROJECT_ID',
  'BUCKET_NAME',
  'WORKER_URL',
  'TASKS_SA_EMAIL',
];
for (const k of REQUIRED_ENVS) {
  if (!process.env[k]) {
    console.error(`[INIT] Missing env: ${k}`);
    // 起動時に即時失敗させ、デプロイ段階で問題を顕在化
    throw new Error(`Missing environment variable: ${k}`);
  }
}

const PROJECT_ID = process.env.PROJECT_ID!;
const BUCKET_NAME = process.env.BUCKET_NAME!;
const WORKER_URL = process.env.WORKER_URL!; // e.g. https://<worker>.run.app/tasks/transcribe
const TASKS_SA_EMAIL = process.env.TASKS_SA_EMAIL!;
const TASKS_LOCATION = process.env.TASKS_LOCATION || 'asia-southeast1';
const TASKS_QUEUE = process.env.TASKS_QUEUE || 'scribe-queue';
const SIGNED_URL_TTL_SECONDS = Number(process.env.SIGNED_URL_TTL_SECONDS ?? 900);

const storage = new Storage();
const bucket = storage.bucket(BUCKET_NAME);
const SAFE_NAME_RE = /^[a-zA-Z0-9._\-\/]{1,200}$/;
const hasDotDot = (p: string) => p.includes('..');
const PORT = Number(process.env.PORT) || 8080;
app.listen(PORT, () => {
  console.log(`[api] listening on ${PORT}`);
});
const SIGNED_URL_TTL_SECONDS = Number(process.env.SIGNED_URL_TTL_SECONDS ?? 3600);

// ========== 共通ユーティリティ ==========
function newJobId() {
  return crypto.randomUUID();
}


/**
 * 中核処理：新しい音声ファイルを受けて、DB登録→チャンク作成→Cloud Tasks投入まで実施。
 * - GCSイベント（POST /）からも
 * - 手動実行（POST /jobs）からも
 * ここを呼び出すことでロジックを完全共通化。
 */
async function processNewAudioFile(gcsUri: string, sliceSec = 600) {
  console.info(`[processNewAudioFile] START uri=${gcsUri} slice=${sliceSec}`);

  // 1) 音声長さの取得
  const local = await downloadToTmp(gcsUri);
  const durationSec = Math.ceil(await ffprobeDurationSeconds(local));
  if (!durationSec || durationSec <= 0) {
    throw new Error(`failed to detect duration for ${gcsUri}`);
  }
  console.info(`[processNewAudioFile] duration=${durationSec}`);

  // 2) プラン作成
  const plan = planChunks(durationSec, sliceSec, 2);
  const jobId = newJobId();
  console.info(`[processNewAudioFile] job=${jobId} chunks=${plan.total}`);

  // 3) DB登録（jobs, chunks）
  await query(
    `INSERT INTO jobs(id, source_uri, duration_sec, chunk_sec, total_chunks, status)
     VALUES ($1,$2,$3,$4,$5,'RUNNING')`,
    [jobId, gcsUri, durationSec, sliceSec, plan.total]
  );

  for (const it of plan.items) {
    await query(
      `INSERT INTO chunks(job_id, idx, start_sec, end_sec, status)
       VALUES ($1,$2,$3,$4,'PENDING')`,
      [jobId, it.idx, it.start, it.end]
    );
  }

// 4) Cloud Tasks へ投入
for (const it of plan.items) {
  await enqueueTranscribeTask({
    jobId,
    gcsUri,
    idx: it.idx,
    startSec: it.start,
    endSec: it.end,
  });
}

  console.info(`[processNewAudioFile] DONE job=${jobId}`);
  return { jobId, durationSec, totalChunks: plan.total, status: 'RUNNING' as const };
}

// ========== Eventarc（GCS最終化）受入口：POST / ==========
// Cloud Storage 直接のEventarc（CloudEvents形式）と、Pub/Sub転送の両方に耐える柔軟実装。
function extractGcsUriFromEventarc(req: express.Request): string | null {
  try {
    const ceType = String(req.header('ce-type') || '');
    const body: any = req.body;

    // 直接（Cloud Storage trigger via Eventarc）
    // 例：{ bucket: "my-bkt", name: "path/file.mp3", ... }
    if (body && typeof body === 'object' && body.bucket && body.name) {
      const uri = `gs://${body.bucket}/${body.name}`;
      console.info(`[Eventarc] Detected direct storage event ce-type=${ceType} uri=${uri}`);
      return uri;
    }

    // Pub/Sub 経由（body.message.data が base64 JSON）
    const msg = body?.message;
    if (msg?.data) {
      const decoded = Buffer.from(String(msg.data), 'base64').toString('utf8');
      let payload: any;
      try { payload = JSON.parse(decoded); } catch {
        console.warn('[Eventarc] message.data is not JSON; raw length=', decoded.length);
      }

      const bucket = payload?.bucket || payload?.resource?.labels?.bucket_name;
      const name = payload?.name || payload?.object || payload?.resource?.labels?.object_name;
      if (bucket && name) {
        const uri = `gs://${bucket}/${name}`;
        console.info(`[Eventarc] Detected via Pub/Sub wrapper ce-type=${ceType} uri=${uri}`);
        return uri;
      }
    }

    console.error('[Eventarc] Unable to extract GCS URI from payload; ce-type=', ceType, ' bodyKeys=', Object.keys(body || {}));
    return null;
  } catch (e: any) {
    console.error('[Eventarc] extract error:', e, e?.stack);
    return null;
  }
}

app.post('/', async (req, res) => {
  console.info('[POST /] Eventarc webhook received. headers.ce-type=', req.header('ce-type') || '(none)');
  try {
    const gcsUri = extractGcsUriFromEventarc(req);
    if (!gcsUri) {
      console.warn('[POST /] Bad payload; cannot extract gcsUri.');
      return res.status(400).json({ error: 'bad_eventarc_payload' });
    }

    const result = await processNewAudioFile(gcsUri, 600);
    console.info(`[POST /] Enqueued job=${result.jobId}`);
    // Eventarcには200/204どちらでも可。ここでは200で詳細返す。
    return res.status(200).json(result);
  } catch (e: any) {
    console.error('[POST /] Fatal:', e, e?.stack);
    // Eventarc側のリトライ制御を考慮し、5xxを返す
    return res.status(500).json({ error: e?.message || 'internal_error' });
  }
});

// ========== 手動実行API（既存互換）：POST /jobs ==========
app.post('/jobs', async (req, res) => {
  console.info('[/jobs] Request received');
  try {
    const { gcsUri, sliceSec = 600 } = req.body || {};
    if (!gcsUri || typeof gcsUri !== 'string' || !gcsUri.startsWith('gs://')) {
      console.warn('[/jobs] Invalid gcsUri:', gcsUri);
      return res.status(400).json({ error: 'gcsUri required (gs://...)' });
    }

    const result = await processNewAudioFile(gcsUri, sliceSec);
    return res.json(result);
  } catch (e: any) {
    console.error('[/jobs] Fatal error:', e, e?.stack);
    return res.status(500).json({ error: e?.message || 'internal error' });
  }
});

// ========== 署名URL発行：POST /uploads ==========
app.post('/uploads', async (req, res) => {
  console.info('[/uploads] Request received');
  try {
    const { fileName, contentType } = req.body ?? {};
    if (!fileName || typeof fileName !== 'string') {
      return res.status(400).json({ error: 'fileName is required' });
    }
    if (!SAFE_NAME_RE.test(fileName) || hasDotDot(fileName)) {
      return res.status(400).json({ error: 'invalid fileName' });
    }

    const ct = contentType && typeof contentType === 'string' ? contentType : 'application/octet-stream';
    const expires = Date.now() + SIGNED_URL_TTL_SECONDS * 1000;
    const file = bucket.file(fileName);

    const [uploadUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires,
      contentType: ct,
    });

    console.info(`[/uploads] Signed URL generated for ${fileName}`);
    return res.status(200).json({
      objectName: fileName,
      bucket: BUCKET_NAME,
      method: 'PUT',
      uploadUrl,
      headers: { 'Content-Type': ct },
      expiresAt: new Date(expires).toISOString(),
      objectUrl: `https://storage.googleapis.com/${encodeURIComponent(BUCKET_NAME)}/${encodeURIComponent(fileName)}`,
    });
  } catch (e: any) {
    console.error('[/uploads] error:', e, e?.stack);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// ========== ステータス参照：GET /jobs/:id ==========
app.get('/jobs/:id', async (req, res) => {
  console.info(`[/jobs/:id] Fetching job ${req.params.id}`);
  try {
    const { id } = req.params;
    const j = await query(
      `SELECT id, status, status_detail, total_chunks, duration_sec, chunk_sec, created_at, updated_at
         FROM jobs WHERE id = $1`,
      [id]
    );
    if (!j.rows[0]) return res.status(404).json({ error: 'not_found' });

    const c = await query(
      `SELECT status, COUNT(*)::text AS count
         FROM chunks WHERE job_id=$1
        GROUP BY status
        ORDER BY status`,
      [id]
    );

    return res.json({ job: j.rows[0], chunkSummary: c.rows });
  } catch (e: any) {
    console.error('[/jobs/:id] error:', e, e?.stack);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// ========== 文字起こし取得：GET /transcripts/:id ==========
app.get('/transcripts/:id', async (req, res) => {
  console.info(`[/transcripts/:id] Fetching transcript for ${req.params.id}`);
  try {
    const { id } = req.params;
    const t = await query(`SELECT text FROM transcripts WHERE job_id=$1`, [id]);
    if (!t.rows[0]) return res.status(404).json({ error: 'not ready' });
    res.type('text/plain; charset=utf-8').send(t.rows[0].text);
  } catch (e: any) {
    console.error('[/transcripts/:id] error:', e, e?.stack);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// ========== 再投入：POST /jobs/:jobId/retry ==========
app.post('/jobs/:jobId/retry', async (req, res) => {
  console.info(`[/jobs/:jobId/retry] Request received`);
  try {
    const { jobId } = req.params;
    const rows = await query(
      `SELECT c.idx, c.start_sec, c.end_sec, j.source_uri AS gcs_uri
         FROM chunks c
         JOIN jobs j ON j.id=c.job_id
        WHERE c.job_id=$1
          AND c.status IN ('FAILED','PENDING')
        ORDER BY c.idx ASC`,
      [jobId]
    );

    if (rows.rowCount === 0) {
      console.info(`[/retry] No chunks to requeue for ${jobId}`);
      return res.json({ ok: true, enqueued: 0, message: 'no FAILED/PENDING chunks' });
    }

    await query(
      `UPDATE chunks
          SET status='PENDING', updated_at=now()
        WHERE job_id=$1 AND status='FAILED'`,
      [jobId]
    );

    let enqueued = 0;
    for (const r of rows.rows) {
      await enqueueTranscribeTask({
        jobId,
        gcsUri: r.gcs_uri,
        idx: r.idx,
        startSec: r.start_sec,
        endSec: r.end_sec,
      });
      enqueued++;
    }

    await query(
      `UPDATE jobs
          SET status='RUNNING',
              status_detail = CONCAT(COALESCE(status_detail,''), ' | Retry requested at ', NOW()),
              updated_at = now()
        WHERE id = $1`,
      [jobId]
    );

    console.info(`[/retry] Job ${jobId}: ${enqueued} chunks requeued`);
    return res.json({ ok: true, enqueued });
  } catch (e: any) {
    console.error('[/jobs/:jobId/retry] error:', e, e?.stack);
    return res.status(500).json({ error: e?.message || 'internal error' });
  }
});

// ========== 健康確認 ==========
app.get('/', (_req, res) => {
  return res.status(200).json({ ok: true, service: 'scribe-api' });
});

// ========== 起動 ==========
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.info(`[scribe-api] Listening on :${PORT}`));
