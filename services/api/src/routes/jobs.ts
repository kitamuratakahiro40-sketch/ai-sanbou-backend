import { Router, Request, Response } from 'express';
import { PrismaClient, JobStatus, SecurityMode } from '@prisma/client';
import { Queue } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
const prisma = new PrismaClient();

// Redis接続設定 (環境変数 または デフォルト)
const REDIS_URL = process.env.REDIS_URL || 'redis://10.56.141.51:6379'; // チャゲ先輩のIPを保持
const connection = {
  host: '10.56.141.51', 
  port: 6379,
  // ※本番環境(Cloud Run)でRedis URL環境変数がある場合はそちらを優先するロジックを入れるのがベスト
};

const QUEUE_NAME = 'sanbou-job-queue'; // Worker側と合わせる必要があります
const jobQueue = new Queue(QUEUE_NAME, { connection });

// ---------------------------------------------------------
// 1. GET / (一覧取得)
// ---------------------------------------------------------
router.get('/', async (req: Request, res: Response) => {
  try {
    const { userId } = req.query;
    console.log(`📡 [GET] Fetching jobs for user: ${userId}`);
    const jobs = await prisma.job.findMany({
      where: { userId: userId ? String(userId) : undefined },
      orderBy: { createdAt: 'desc' }
    });
    return res.json({ jobs });
  } catch (error) {
    console.error('❌ [GET] Error:', error);
    return res.status(500).json({ error: 'DB Fetch Failed' });
  }
});

// ---------------------------------------------------------
// 2. GET /:id (詳細取得) - ポーリング用
// ---------------------------------------------------------
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const job = await prisma.job.findUnique({ where: { id } });
    if (!job) return res.status(404).json({ error: 'Job not found' });
    return res.json({ job });
  } catch (error) {
    return res.status(500).json({ error: 'DB Error' });
  }
});

// ---------------------------------------------------------
// 3. POST / (新規ジョブ作成) - FileUploaderから呼ばれる
// ---------------------------------------------------------
router.post('/', async (req: Request, res: Response) => {
  try {
    // ★重要: multerは削除しました。FrontendからJSONでパスだけ送られてくるためです。
    console.log("📦 [DEBUG] Received Body:", JSON.stringify(req.body, null, 2));
    const { gcsPath, userId, projectName, securityMode } = req.body;
    
    // ガード: 必須項目チェック
    if (!gcsPath) return res.status(400).json({ error: 'gcsPath is required' });

    const targetUserId = String(userId || 'cmjfb9m620000clqy27f31wo4'); // 固定IDフォールバック

    console.log(`📡 [POST] New Job Request: ${projectName} (${gcsPath})`);

    // ユーザー自動生成 (P2003回避)
    await prisma.user.upsert({
      where: { id: targetUserId },
      update: {},
      create: { id: targetUserId, email: `user-${targetUserId}@example.com`, name: 'Test User' }
    });

    // DB作成
    const job = await prisma.job.create({
      data: {
        id: uuidv4(),
        projectName: projectName || 'Untitled Project',
        userId: targetUserId,
        type: 'AUDIO',
        status: JobStatus.QUEUED,
        sourceUrl: `gs://sanbou-ai-transcripts/${gcsPath}`, // バケット名は環境変数推奨だが一旦固定
        security: (securityMode as SecurityMode) || SecurityMode.CONFIDENTIAL,
      }
    });

    // Workerへ指令 (文字起こし開始)
    await jobQueue.add('process-job', { 
      jobId: job.id, 
      action: 'TRANSCRIBE' // 最初のステップ
    });

    return res.status(200).json({ job });

  } catch (error: any) {
    console.error('❌ [POST] Error:', error);
    return res.status(500).json({ error: 'Job Creation Failed', detail: error.message });
  }
});

// ---------------------------------------------------------
// 4. POST /:id/analyze (追加分析・アクション) - 詳細画面から呼ばれる
// ---------------------------------------------------------
router.post('/:id/analyze', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { type, ...options } = req.body; // type: 'PPT' | 'TRANSLATE' | 'NARRATIVE' ...

    console.log(`📡 [ANALYZE] Job: ${id}, Action: ${type}`);

    // DB確認
    const job = await prisma.job.findUnique({ where: { id } });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    // ステータスを更新してユーザーに「反応」を返す
    await prisma.job.update({
        where: { id },
        data: { status: JobStatus.QUEUED } // 再度キューに入れるのでQUEUEDへ
    });

    // Workerへ指令 (追加タスク)
    await jobQueue.add('process-job', {
      jobId: id,
      action: type, // 'PPT' や 'TRANSLATE' がここに入る
      options: options // targetLang などのオプション
    });

    return res.json({ success: true, message: `Action ${type} queued.` });

  } catch (error: any) {
    console.error('❌ [ANALYZE] Error:', error);
    return res.status(500).json({ error: 'Analysis Request Failed' });
  }
});

// ---------------------------------------------------------
// 5. PATCH /:id (メタデータ更新) - 保存ボタン用
// ---------------------------------------------------------
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = req.body; // projectName, speakerMap, transcript編集結果など

    await prisma.job.update({
      where: { id },
      data: data
    });

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: 'Update Failed' });
  }
});

// ---------------------------------------------------------
// 6. DELETE /:id (削除)
// ---------------------------------------------------------
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.job.delete({ where: { id } });
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: 'Delete Failed' });
  }
});

export default router;