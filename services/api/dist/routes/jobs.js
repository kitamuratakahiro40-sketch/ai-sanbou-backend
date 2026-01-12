"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const bullmq_1 = require("bullmq");
const uuid_1 = require("uuid");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
// Redis接続設定
const REDIS_URL = process.env.REDIS_URL || 'redis://10.56.141.51:6379';
const connection = {
    host: '10.56.141.51',
    port: 6379,
};
const QUEUE_NAME = 'sanbou-job-queue';
const jobQueue = new bullmq_1.Queue(QUEUE_NAME, { connection });
// ---------------------------------------------------------
// 1. GET / (一覧取得)
// ---------------------------------------------------------
router.get('/', async (req, res) => {
    try {
        const { userId } = req.query;
        // ★修正: userIdがない場合はエラーにする（セキュリティ強化）
        if (!userId) {
            return res.status(400).json({ error: 'User ID is required' });
        }
        console.log(`📡 [GET] Fetching jobs for user: ${userId}`);
        const jobs = await prisma.job.findMany({
            where: { userId: String(userId) },
            orderBy: { createdAt: 'desc' }
        });
        return res.json({ jobs });
    }
    catch (error) {
        console.error('❌ [GET] Error:', error);
        return res.status(500).json({ error: 'DB Fetch Failed' });
    }
});
// ---------------------------------------------------------
// 2. GET /:id (詳細取得)
// ---------------------------------------------------------
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const job = await prisma.job.findUnique({ where: { id } });
        if (!job)
            return res.status(404).json({ error: 'Job not found' });
        return res.json({ job });
    }
    catch (error) {
        return res.status(500).json({ error: 'DB Error' });
    }
});
// ---------------------------------------------------------
// 3. POST / (新規ジョブ作成)
// ---------------------------------------------------------
router.post('/', async (req, res) => {
    try {
        console.log("📦 [DEBUG] Received Body:", JSON.stringify(req.body, null, 2));
        const { gcsPath, userId, projectName, securityMode } = req.body;
        // ガード: 必須項目チェック
        if (!gcsPath)
            return res.status(400).json({ error: 'gcsPath is required' });
        // 🚨【修正箇所】 固定IDフォールバックを完全削除
        if (!userId) {
            console.error("❌ [POST] Missing User ID");
            return res.status(400).json({ error: 'User ID is required. Please login.' });
        }
        const targetUserId = String(userId);
        console.log(`📡 [POST] New Job Request: ${projectName} (${gcsPath})`);
        // ユーザー自動生成
        await prisma.user.upsert({
            where: { id: targetUserId },
            update: {},
            create: { id: targetUserId, email: `user-${targetUserId}@example.com`, name: 'Test User' }
        });
        // DB作成
        const job = await prisma.job.create({
            data: {
                id: (0, uuid_1.v4)(),
                projectName: projectName || 'Untitled Project',
                userId: targetUserId,
                type: 'AUDIO',
                status: client_1.JobStatus.QUEUED,
                sourceUrl: `gs://sanbou-ai-transcripts/${gcsPath}`,
                security: securityMode || client_1.SecurityMode.CONFIDENTIAL,
            }
        });
        // Workerへ指令
        await jobQueue.add('process-job', {
            jobId: job.id,
            action: 'TRANSCRIBE'
        });
        return res.status(200).json({ job });
    }
    catch (error) {
        console.error('❌ [POST] Error:', error);
        return res.status(500).json({ error: 'Job Creation Failed', detail: error.message });
    }
});
// ---------------------------------------------------------
// 4. POST /:id/analyze (追加分析)
// ---------------------------------------------------------
router.post('/:id/analyze', async (req, res) => {
    try {
        const { id } = req.params;
        const { type, ...options } = req.body;
        console.log(`📡 [ANALYZE] Job: ${id}, Action: ${type}`);
        const job = await prisma.job.findUnique({ where: { id } });
        if (!job)
            return res.status(404).json({ error: 'Job not found' });
        await prisma.job.update({
            where: { id },
            data: { status: client_1.JobStatus.QUEUED }
        });
        await jobQueue.add('process-job', {
            jobId: id,
            action: type,
            options: options
        });
        return res.json({ success: true, message: `Action ${type} queued.` });
    }
    catch (error) {
        console.error('❌ [ANALYZE] Error:', error);
        return res.status(500).json({ error: 'Analysis Request Failed' });
    }
});
// ---------------------------------------------------------
// 5. PATCH /:id (メタデータ更新・Workerからの完了報告)
// ---------------------------------------------------------
router.patch('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        // 🚨 修正前: const data = req.body; 
        // これだとWorkerが送ってきた "古いuserId" でDBを上書きしてしまう
        // ✅ 修正後: userId が送られてきても無視（除外）する
        // ...data には userId 以外のデータ（status, transcriptなど）が入る
        const { userId, ...updateData } = req.body;
        console.log(`📝 [PATCH] Updating Job: ${id}`);
        // console.log("Ignore userId update for security"); 
        await prisma.job.update({
            where: { id },
            data: updateData // userIdを含まないデータだけで更新
        });
        return res.json({ success: true });
    }
    catch (error) {
        console.error('❌ [PATCH] Error:', error);
        return res.status(500).json({ error: 'Update Failed' });
    }
});
// ---------------------------------------------------------
// 6. DELETE /:id (削除)
// ---------------------------------------------------------
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.job.delete({ where: { id } });
        return res.json({ success: true });
    }
    catch (error) {
        return res.status(500).json({ error: 'Delete Failed' });
    }
});
exports.default = router;
