// services/worker/src/worker.ts
import express from "express";
import { Pool } from "pg";
import { Storage } from "@google-cloud/storage";
import fs from "fs/promises";
import path from "path";
import { download, ffmpegExtract, TMP_DIR } from './util.js';
import { VertexAI } from "@google-cloud/vertexai";

const app = express();
app.use(express.json());

// ==== env ====
const PORT = Number(process.env.PORT || 8080);
const PGHOST = process.env.PGHOST;
const PGPORT = Number(process.env.PGPORT || 5432);
const PGUSER = process.env.PGUSER;
const PGPASSWORD = process.env.PGPASSWORD;
const PGDATABASE = process.env.PGDATABASE;

const BUCKET_NAME = process.env.BUCKET_NAME; // gs://<bucket>/out/<jobId>.txt に保存

const PROJECT_ID =
  process.env.PROJECT_ID ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCP_PROJECT ||
  "";

const VERTEX_LOCATION = process.env.VERTEX_LOCATION || "us-central1";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-pro";

// ==== clients ====
const pool = new Pool({
  host: PGHOST,
  port: PGPORT,
  user: PGUSER,
  password: PGPASSWORD,
  database: PGDATABASE,
});
const storage = new Storage();

// ==== Vertex AI ====
let vtx: VertexAI | null = null;
function getModel() {
  if (!vtx) {
    if (!PROJECT_ID) throw new Error("PROJECT_ID/GOOGLE_CLOUD_PROJECT が未設定です");
    vtx = new VertexAI({
      project: PROJECT_ID,
      location: VERTEX_LOCATION,
      apiEndpoint: `${VERTEX_LOCATION}-aiplatform.googleapis.com`,
    });
  }
  return vtx.getGenerativeModel({ model: GEMINI_MODEL });
}

async function transcribeWav(wavPath: string): Promise<string> {
  const b = await fs.readFile(wavPath);
  const model = getModel();
  const resp = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [
          { text: "Transcribe the audio. Return only the transcript in the original language." },
          { inlineData: { mimeType: "audio/wav", data: b.toString("base64") } },
        ],
      },
    ],
  });
  const text =
    (resp as any).response?.candidates?.[0]?.content?.parts
      ?.map((p: any) => p?.text ?? "")
      .join("")
      .trim() || "";
  if (!text) throw new Error("Empty transcript from model");
  return text;
}

/**
 * チャンク完了毎に呼び、ジョブ完了なら transcripts 生成 & GCS へ out/<jobId>.txt 保存
 */
async function maybeFinalize(jobId: string) {
  const client = await pool.connect();
  try {
    const sum = await client.query(
      `SELECT
         SUM((status='PENDING')::int) AS pending,
         SUM((status='RUNNING')::int) AS running,
         SUM((status='FAILED')::int)  AS failed
       FROM chunks
       WHERE job_id = $1`,
      [jobId]
    );
    const { pending, running, failed } = sum.rows[0] || {
      pending: 0,
      running: 0,
      failed: 0,
    };

    if (Number(failed) > 0) {
      await client.query(
        `UPDATE jobs SET status='FAILED', status_detail=$2, updated_at=NOW() WHERE id=$1`,
        [jobId, "One or more chunks FAILED"]
      );
      return;
    }
    if (Number(pending) > 0 || Number(running) > 0) return;

    const qTexts = await client.query(
      `SELECT idx, COALESCE(text,'') AS text
         FROM chunks
        WHERE job_id=$1
        ORDER BY idx`,
      [jobId]
    );
    const full = qTexts.rows.map((r: any) => r.text).join("\n").trim();

    await client.query(
      `INSERT INTO transcripts(job_id, text, created_at, updated_at)
       VALUES($1, $2, NOW(), NOW())
       ON CONFLICT (job_id)
       DO UPDATE SET text=EXCLUDED.text, updated_at=NOW()`,
      [jobId, full]
    );

    await client.query(
      `UPDATE jobs SET status='COMPLETED', status_detail=$2, updated_at=NOW() WHERE id=$1`,
      [jobId, `Transcription assembled (${qTexts.rows.length} chunks)`]
    );

    if (!BUCKET_NAME) {
      console.warn("BUCKET_NAME not set; skipping GCS write");
      return;
    }
    const file = storage.bucket(BUCKET_NAME).file(`out/${jobId}.txt`);
    await file.save(full, {
      resumable: false,
      contentType: "text/plain; charset=utf-8",
      metadata: { cacheControl: "no-store" },
    });
    console.log(`Saved GCS: gs://${BUCKET_NAME}/out/${jobId}.txt`);
  } finally {
    client.release();
  }
}

/**
 * Cloud Tasks から叩かれる想定
 * body: { jobId, idx, gcsUri, startMs?, endMs?, languageHint? }
 */
app.post("/tasks/transcribe", async (req, res) => {
  const { jobId, idx, gcsUri, startMs, endMs, languageHint = "auto" } = req.body || {};

  const retryHeader =
    req.header("Cloud-Tasks-Task-Retry-Count") ||
    req.header("X-CloudTasks-TaskRetryCount") ||
    "0";
  const retryCount = parseInt(retryHeader, 10) || 0;

  if (!jobId || typeof idx !== "number" || !gcsUri) {
    return res.status(400).json({ ok: false, error: "invalid payload" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE chunks
         SET status='RUNNING', retry_count=$1, updated_at=NOW()
       WHERE job_id=$2 AND idx=$3`,
      [retryCount, jobId, idx]
    );

    // 作業DIR
    const workDir = path.join(TMP_DIR, jobId, String(idx));
    await fs.mkdir(workDir, { recursive: true });

    // DL → 区間抽出
    const src = path.join(workDir, "src.audio");
    const seg = path.join(workDir, "seg.wav");
    await download(gcsUri, src);

// 変更後（endMs が未指定なら 60秒区間にフォールバック）
const sSec: number = typeof startMs === "number" ? startMs / 1000 : 0;
const eSec: number = (typeof endMs === "number" ? endMs / 1000 : sSec + 60);
// 念のため、end > start を保証
const safeEnd: number = eSec > sSec ? eSec : sSec + 1;

await ffmpegExtract(src, seg, sSec, safeEnd);

    // 実トランスクリプト
    const text = await transcribeWav(seg);

    await client.query(
      `UPDATE chunks
         SET status='DONE',
             text=$1,
             payload_json=$2,
             start_ms=COALESCE($3, start_ms),
             end_ms=COALESCE($4, end_ms),
             updated_at=NOW()
       WHERE job_id=$5 AND idx=$6`,
      [
        text,
        JSON.stringify({ gcsUri, languageHint }),
        typeof startMs === "number" ? startMs : null,
        typeof endMs === "number" ? endMs : null,
        jobId,
        idx,
      ]
    );

    await client.query("COMMIT");
    res.json({ ok: true });
    await maybeFinalize(jobId);
  } catch (err: any) {
    await client.query("ROLLBACK");
    console.error("transcribe failed:", err?.message || err);
    try {
      await client.query(
        `UPDATE chunks
           SET status='FAILED',
               error_msg=$1,
               retry_count=$2,
               updated_at=NOW()
         WHERE job_id=$3 AND idx=$4`,
        [String(err?.message || err), retryCount, jobId, idx]
      );
      await client.query(
        `UPDATE jobs
           SET status='RUNNING',
               status_detail=$2,
               updated_at=NOW()
         WHERE id=$1`,
        [jobId, "Chunk failed (retry or /retry)"]
      );
    } catch (e2) {
      console.error("error marking failure:", e2);
    }
    res.status(500).json({ ok: false, error: "worker error" });
  } finally {
    client.release();
    // 片付け
    try { await fs.rm(path.join(TMP_DIR, jobId, String(idx)), { recursive: true, force: true }); } catch {}
  }
});

app.get('/healthz', (_req, res) => res.status(200).send('ok'));
app.get('/', (_req, res) => res.status(200).send('ok'));
app.listen(PORT, () => console.log(`Worker listening on :${PORT}`));
process.on("unhandledRejection", (e) => console.error("unhandledRejection", e));
process.on("uncaughtException", (e) => console.error("uncaughtException", e));
