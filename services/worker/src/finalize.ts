// services/worker/src/finalize.ts
import type { Pool } from "pg";

type FinalizeInput = {
  jobId: string;
  gcsUri: string;         // 例: gs://bucket/out/<jobId>.txt
  transcriptBody: string; // 全文
};

const MAX_TX_RETRIES = 3;
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
const pad = (n: number) => String(n).padStart(2, "0");
function nowTimestamp() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} `
       + `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export async function finalizeSuccess(
  pool: Pool,
  { jobId, gcsUri, transcriptBody }: FinalizeInput
): Promise<void> {
  let attempt = 0;

  while (true) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 二重確定の抑止（Advisory Lock）
      const { rows: lockRows } = await client.query<{ ok: boolean }>(
        `SELECT pg_try_advisory_lock(hashtext($1)) AS ok`,
        [jobId]
      );
      if (!lockRows[0]?.ok) {
        throw new Error(`another worker is finalizing job ${jobId}`);
      }

      // chunks を DONE に（冪等）
      await client.query(
        `UPDATE chunks SET status='DONE', updated_at=NOW()
         WHERE job_id=$1 AND status <> 'DONE'`,
        [jobId]
      );

      // transcripts UPSERT（finalized_at を刻む / updated_at はトリガで更新）
      await client.query(
        `INSERT INTO transcripts (job_id, text, finalized_at)
           VALUES ($1, $2, NOW())
         ON CONFLICT (job_id)
           DO UPDATE SET
             text = EXCLUDED.text,
             finalized_at = NOW()`,
        [jobId, transcriptBody]
      );

      // jobs を COMPLETED + status_detail に保存URI明記（最重要）
      const detail =
        `Transcription assembled (${transcriptBody.length} chars at ${nowTimestamp()}) | saved to ${gcsUri}`;
      await client.query(
        `UPDATE jobs
           SET status='COMPLETED',
               status_detail=$2,
               completed_at=NOW(),
               updated_at=NOW()
         WHERE id=$1`,
        [jobId, detail]
      );

      // 事後条件チェック（勝利の刻印）
      const { rows } = await client.query<{ status: string; status_detail: string }>(
        `SELECT status, status_detail FROM jobs WHERE id=$1 FOR UPDATE`,
        [jobId]
      );
      if (!rows[0] || rows[0].status !== "COMPLETED" || !rows[0].status_detail?.includes("saved to gs://")) {
        throw new Error(`post-condition failed for job ${jobId}`);
      }

      await client.query("COMMIT");
      return; // 正常終了
    } catch (err: any) {
      // 失敗時処理（競合は限定リトライ）
      try { await client.query("ROLLBACK"); } catch {}
      const code = err?.code as string | undefined;
      if ((code === "40001" || code === "40P01") && attempt < MAX_TX_RETRIES) {
        attempt++;
        await sleep(50 * attempt); // 短い指数バックオフ
        continue; // 再試行
      }

      // リトライ不可の失敗は FAILED で記録
      try {
        const c2 = await pool.connect();
        try {
          await c2.query("BEGIN");
          const failMsg = `Finalize failed: ${String(err?.message || err)} | last saved: ${gcsUri}`;
          await c2.query(
            `UPDATE jobs
               SET status='FAILED',
                   status_detail=$2,
                   updated_at=NOW()
             WHERE id=$1`,
            [jobId, failMsg]
          );
          await c2.query("COMMIT");
        } finally {
          c2.release();
        }
      } catch {
        // 二次失敗は握りつぶし（ログは上位で）
      }

      throw err; // 呼び出し側に伝播
    } finally {
      // ロック解放 & コネクション返却
      try { await client.query(`SELECT pg_advisory_unlock(hashtext($1))`, [jobId]); } catch {}
      client.release();
    }
  }
}

export async function finalizeFailure(pool: Pool, jobId: string, reason: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE jobs
         SET status='FAILED',
             status_detail=$2,
             updated_at=NOW()
       WHERE id=$1`,
      [jobId, reason]
    );
    await client.query("COMMIT");
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    throw e;
  } finally {
    client.release();
  }
}
