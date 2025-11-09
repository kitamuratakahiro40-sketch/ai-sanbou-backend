import express, { Request, Response } from "express";
import bodyParser from "body-parser";
import { VertexAI } from "@google-cloud/vertexai";
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { download, ffmpegExtract, TMP_DIR } from "./util";
import { Storage } from "@google-cloud/storage";
import { query, getPool } from "./db";
import { finalizeSuccess, finalizeFailure } from "./finalize";


const app = express();
app.use(bodyParser.json());


// ★ ヘルスチェック（確実にトップレベルで）
app.get("/", (_req: Request, res: Response) => res.status(200).send("ok"));
app.get("/healthz", (_req: Request, res: Response) => res.status(200).send("ok"));
app.get("/ping", (_req: Request, res: Response) => res.status(200).send("ok"));

// 起動
const PORT = Number(process.env.PORT) || 8080;
app.listen(PORT, () => {
  console.log(`[worker] listening on :${PORT}`);
});

// ---- Vertex AI（遅延初期化）----
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-pro";
const DEFAULT_LOCATION =
  process.env.VERTEX_LOCATION || process.env.LOCATION || "us-central1";

let vertexInstance: VertexAI | null = null;
function getVertex(): VertexAI {
  if (vertexInstance) return vertexInstance;

  const project =
    process.env.PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCP_PROJECT ||
    "";

  if (!project) {
    throw new Error("PROJECT_ID/GOOGLE_CLOUD_PROJECT が未設定です");
  }

  const location = DEFAULT_LOCATION;
  vertexInstance = new VertexAI({
    project,
    location,
    apiEndpoint: `${location}-aiplatform.googleapis.com`,
  });
  return vertexInstance;
}

// ---- GCS 出力（gs://.../out/{jobId}.txt）----
const OUT_BUCKET_NAME = process.env.BUCKET_NAME;
if (!OUT_BUCKET_NAME) {
  throw new Error("BUCKET_NAME is not set; cannot save transcripts to GCS");
}
const storage = new Storage();
const outBucket = storage.bucket(OUT_BUCKET_NAME);

async function saveTranscriptToGCS(jobId: string, text: string): Promise<string> {
  const objectPath = `out/${jobId}.txt`;
  await outBucket.file(objectPath).save(text, {
    resumable: false,
    contentType: "text/plain; charset=utf-8",
    metadata: { cacheControl: "no-cache" },
  });
  return `gs://${OUT_BUCKET_NAME}/${objectPath}`;
}

function sanitizeTranscript(t: string): string {
  // [stub] などのスタブ文字列を除去
  return (t || "")
    .replace(/\[stub[^\]]*\]/gi, "")
    .replace(/\[placeholder[^\]]*\]/gi, "")
    .trim();
}

async function transcribeWav(wavPath: string): Promise<string> {
  const b = await fs.readFile(wavPath);
  const model = getVertex().getGenerativeModel({ model: MODEL });
  const res = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [
          {
            text:
              "You are a professional transcriber. Output only transcript. Keep original language.",
          },
          { inlineData: { mimeType: "audio/wav", data: b.toString("base64") } },
        ],
      },
    ],
  });

  const text =
    (res as any).response?.candidates?.[0]?.content?.parts
      ?.map((p: any) => p?.text ?? "")
      .join("")
      ?.trim() || "";

  return sanitizeTranscript(text);
}

// ---- DBユーティリティ（idx / chunkId 両対応）----
type IdxOrChunkId =
  | { mode: "idx"; key: number }
  | { mode: "chunkId"; key: string };

function resolveKey(idx: number | undefined, chunkId: string | undefined): IdxOrChunkId {
  if (typeof idx === "number") return { mode: "idx", key: idx };
  if (typeof chunkId === "string" && chunkId.length > 0)
    return { mode: "chunkId", key: chunkId };
  throw new Error("idx か chunkId のいずれかが必須です");
}

async function markChunkRunning(jobId: string, idKey: IdxOrChunkId, retryCount: number) {
  if (idKey.mode === "idx") {
    await query(
      `UPDATE chunks
         SET status='RUNNING', retry_count=$1, updated_at=now()
       WHERE job_id=$2 AND idx=$3`,
      [retryCount, jobId, idKey.key]
    );
  } else {
    await query(
      `UPDATE chunks
         SET status='RUNNING', retry_count=$1, updated_at=now()
       WHERE job_id=$2 AND id=$3`,
      [retryCount, jobId, idKey.key]
    );
  }
}

async function markChunkDone(jobId: string, idKey: IdxOrChunkId, text: string) {
  if (idKey.mode === "idx") {
    await query(
      `UPDATE chunks
         SET status='DONE', text=$1, updated_at=now()
       WHERE job_id=$2 AND idx=$3`,
      [text, jobId, idKey.key]
    );
  } else {
    await query(
      `UPDATE chunks
         SET status='DONE', text=$1, updated_at=now()
       WHERE job_id=$2 AND id=$3`,
      [text, jobId, idKey.key]
    );
  }
}

async function markChunkFailed(jobId: string, idKey: IdxOrChunkId, errMsg: string) {
  if (idKey.mode === "idx") {
    await query(
      `UPDATE chunks
         SET status='FAILED', error_msg=$1, updated_at=now()
       WHERE job_id=$2 AND idx=$3`,
      [errMsg, jobId, idKey.key]
    );
  } else {
    await query(
      `UPDATE chunks
         SET status='FAILED', error_msg=$1, updated_at=now()
       WHERE job_id=$2 AND id=$3`,
      [errMsg, jobId, idKey.key]
    );
  }
}

// すべて完了したら transcript を確定し、GCS に保存、jobs を COMPLETED へ
async function finalizeIfAllDone(jobId: string) {
  // まだ終わっていないチャンクがあるなら何もしない
  const pend = await query<{ count: string }>(
    `SELECT count(*) FROM chunks WHERE job_id=$1 AND status <> 'DONE'`,
    [jobId]
  );
  if (!pend || !pend.rows || !pend.rows[0] || Number(pend.rows[0].count) !== 0) return;


  // 全文を連結
  const parts = await query<{ text: string; idx: number }>(
    `SELECT idx, COALESCE(text,'') AS text
       FROM chunks
      WHERE job_id=$1
      ORDER BY idx ASC`,
    [jobId]
  );
  const full = sanitizeTranscript(parts.rows.map((r: any) => r.text).join("\n"));

  // GCS へ保存 → finalizeSuccess で DB を一括確定
  try {
    const savedUri = await saveTranscriptToGCS(jobId, full);
    await finalizeSuccess(getPool(), { jobId, gcsUri: savedUri, transcriptBody: full });
    console.log(`Saved GCS: ${savedUri}`);
    console.log(`DBCOMMIT: job ${jobId} COMPLETED`);
  } catch (e: any) {
    const reason = `finalizeIfAllDone failed: ${e?.message ?? e}`;
    await finalizeFailure(getPool(), jobId, reason);
    console.error(reason);
  }
}

/**
 * 旧/新 Cloud Tasks ペイロード両対応＋ルート(/ と /tasks/transcribe)両対応ハンドラ
 * 旧: { jobId, gcsUri, idx, startSec, endSec, retryCount? }
 * 新: { jobId, gcsUri, chunkId, startMs, endMs, retryCount? }
 */
const transcribeHandler = async (req: Request, res: Response) => {
  const b = (req.body || {}) as any;

  const jobId: string | undefined = b.jobId;
  const gcsUri: string | undefined = b.gcsUri;

  // idx / chunkId どちらでもOK
  const idx: number | undefined =
    typeof b.idx === "number"
      ? b.idx
      : typeof b.chunkIndex === "number"
      ? b.chunkIndex
      : undefined;
  const chunkId: string | undefined = typeof b.chunkId === "string" ? b.chunkId : undefined;

  // 時刻正規化（ms優先、なければsec→ms）
  const startMs: number | undefined =
    typeof b.startMs === "number"
      ? b.startMs
      : typeof b.startSec === "number"
      ? Math.round(b.startSec * 1000)
      : undefined;
  const endMs: number | undefined =
    typeof b.endMs === "number"
      ? b.endMs
      : typeof b.endSec === "number"
      ? Math.round(b.endSec * 1000)
      : undefined;

  if (!jobId || !gcsUri || (idx === undefined && !chunkId)) {
    return res
      .status(400)
      .json({ error: "jobId, gcsUri, and idx(or chunkId) are required" });
  }

  if (typeof startMs !== "number" || typeof endMs !== "number" || !(endMs > startMs)) {
    return res.status(400).json({ error: "startMs/endMs が不正です" });
  }

  const idKey = resolveKey(idx, chunkId);

  // ffmpegExtract が秒前提のため秒へ
  const startSec = startMs / 1000;
  const endSec = endMs / 1000;

  const retryCount = Number(b.retryCount ?? 0);

  // 作業パス
  const key = idKey.mode === "idx" ? String(idKey.key) : String(idKey.key);
  const workDir = path.join(TMP_DIR, `${jobId}-${key}`);
  const src = path.join(workDir, "src.bin"); // 拡張子は任意
  const seg = path.join(workDir, "seg.wav");

  try {
    // 0) チャンクを RUNNING
    await markChunkRunning(jobId, idKey, retryCount);

    // 1) ダウンロード & 切り出し
    await fs.mkdir(workDir, { recursive: true });
    await download(gcsUri, src);
    await ffmpegExtract(src, seg, startSec, endSec);

    // 2) 文字起こし
    const transcript = await transcribeWav(seg);

    // 3) 成功（DONE）
    await markChunkDone(jobId, idKey, transcript);

    // 4) 全チャンク完了で確定・保存
    await finalizeIfAllDone(jobId);

    return res.json({ ok: true });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    // 失敗の記録
    try {
      await query(
        `UPDATE jobs
            SET status_detail = CONCAT(COALESCE(status_detail,''), ' | chunk ', $2, ' failed: ', $3),
                updated_at = now()
          WHERE id = $1`,
        [jobId, key, msg]
      );
      await markChunkFailed(jobId, idKey, msg);
    } catch (e2) {
      // ここでのDB更新失敗は致命ではないためログのみ
      console.error("failed to record failure:", e2);
    }
    console.error(e);
    return res.status(500).json({ error: msg || "failed" });
  } finally {
    // 作業ディレクトリ掃除
    try {
      await fs.rm(workDir, { recursive: true, force: true });
    } catch {}
  }
};

// 正式ルート
app.post("/tasks/transcribe", transcribeHandler);

// ★ フォールバック（旧実装が Cloud Tasks で "/" に投げていたため）
app.post("/", transcribeHandler);

// ヘルスチェック
app.get("/", (_req: Request, res: Response) => res.status(200).send("ok"));
app.get("/healthz", (_req: Request, res: Response) => res.status(200).send("ok"));
app.get("/ping", (_req: Request, res: Response) => res.status(200).send("ok"));

app.listen(PORT, () => console.log(`Worker listening on :${PORT}`));
// 既存のヘルス周りのすぐ下に追加
app.get("/ping", (_req: Request, res: Response) => res.status(200).send("ok"));

/** health endpoints (idempotent, safe to duplicate) */
app.get('/',   (_req: Request, res: Response) => res.status(200).send('ok'));
app.get('/healthz', (_req: Request, res: Response) => res.status(200).send('ok'));
app.get('/ping', (_req: Request, res: Response) => res.status(200).send('ok'));
