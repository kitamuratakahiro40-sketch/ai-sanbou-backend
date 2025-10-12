// api.ts (例) — Express ハンドラ
import express from "express";
import { pool } from "./db"; // node-postgres Pool
import { enqueueChunkTask } from "./tasks";
const router = express.Router();
router.post("/jobs/:jobId/retry", async (req, res) => {
    const { jobId } = req.params;
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const job = await client.query("SELECT id FROM jobs WHERE id=$1 FOR UPDATE", [jobId]);
        if (job.rowCount === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: "job not found" });
        }
        const failed = await client.query("SELECT id, index, payload_json FROM chunks WHERE job_id=$1 AND status='FAILED' ORDER BY index ASC", [jobId]);
        if (failed.rowCount === 0) {
            await client.query("ROLLBACK");
            return res.status(200).json({ retried: 0, message: "no FAILED chunks" });
        }
        // PENDING に戻す
        await client.query("UPDATE chunks SET status='PENDING' WHERE job_id=$1 AND status='FAILED'", [jobId]);
        // status_detail の追記
        await client.query("UPDATE jobs SET status='RUNNING', status_detail=COALESCE(status_detail,'') || $2 WHERE id=$1", [jobId, `\n[${new Date().toISOString()}] Retry requested via API`]);
        await client.query("COMMIT");
        // トランザクション外でタスク再投入
        let count = 0;
        for (const row of failed.rows) {
            await enqueueChunkTask(jobId, row.id, JSON.parse(row.payload_json));
            count++;
        }
        return res.json({ retried: count });
    }
    catch (e) {
        await pool.query("ROLLBACK");
        console.error(e);
        return res.status(500).json({ error: "internal" });
    }
    finally {
        client.release();
    }
});
export default router;
