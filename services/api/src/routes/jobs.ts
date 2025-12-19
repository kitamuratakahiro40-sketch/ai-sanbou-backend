import { Router } from 'express';
import multer from 'multer';
import { PrismaClient, JobType, JobStatus, SecurityMode } from '@prisma/client';
import { Storage } from '@google-cloud/storage';
import { Queue } from 'bullmq'; // ★追加
import { v4 as uuidv4 } from 'uuid';

const router = Router();
const prisma = new PrismaClient();
const storage = new Storage();
const upload = multer({ storage: multer.memoryStorage() });

const BUCKET_NAME = process.env.GCS_BUCKET_NAME || 'ai-sanbou-bucket';

// ★Redisキューの設定（Workerと同じ設定にする）
const jobQueue = new Queue('job-queue', {
  connection: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  }
});

// 一覧取得
router.get('/', async (req, res) => {
  try {
    const jobs = await prisma.job.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ jobs });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

// 詳細取得
router.get('/:id', async (req, res) => {
  try {
    const job = await prisma.job.findUnique({ where: { id: req.params.id } });
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json({ job });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch job' });
  }
});

// ★新規作成（ここが修正のメイン）
router.post('/', upload.single('file'), async (req: any, res: any) => {
  try {
    console.log('📝 New Job Request');
    
    if (!req.file && !req.body.rawText) {
      return res.status(400).json({ error: 'No file or content provided' });
    }

    const jobId = uuidv4();
    let sourceUrl = '';
    let type: JobType = 'AUDIO'; 

    // GCSアップロード処理
    if (req.file) {
      const blob = storage.bucket(BUCKET_NAME).file(`uploads/${jobId}/${req.file.originalname}`);
      await blob.save(req.file.buffer);
      sourceUrl = `gs://${BUCKET_NAME}/uploads/${jobId}/${req.file.originalname}`;
      
      if (req.file.mimetype.startsWith('audio/')) type = 'AUDIO';
      else if (req.file.mimetype.startsWith('video/')) type = 'VIDEO';
      else type = 'TEXT';
    } else if (req.body.rawText) {
      type = 'TEXT';
    }

    // 1. DB保存
    const job = await prisma.job.create({
      data: {
        id: jobId,
        projectName: req.body.projectName || 'Untitled Project',
        clientName: req.body.clientName || '',
        type: type,
        status: JobStatus.QUEUED, // 最初からQUEUEDにする
        sourceUrl: sourceUrl,
        rawText: req.body.rawText || '',
        security: SecurityMode.CONFIDENTIAL,
      }
    });

    console.log(`✅ DB Saved: ${job.id}`);

    // 2. ★Workerへ通知（これを忘れていました！）
    // 音声なら文字起こし(TRANSCRIBE)、テキストなら要約(NARRATIVE)へ
    const action = type === 'TEXT' ? 'NARRATIVE' : 'TRANSCRIBE';
    
    await jobQueue.add('process-job', { 
      jobId: job.id, 
      action: action 
    });
    
    console.log(`🚀 Queue Added: ${job.id} (Action: ${action})`);

    res.json({ job });

  } catch (error) {
    console.error('Error creating job:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 分析リクエスト (再実行・翻訳・部分要約など)
router.post('/:id/analyze', async (req, res) => {
  try {
    const { id } = req.params;
    const { type, textContext, targetLang, sourceText } = req.body;

    console.log(`📡 Analysis Requested for Job ${id}: ${type}`);

    // Workerへ通知
    await jobQueue.add('process-job', { 
        jobId: id, 
        action: type,
        options: { textContext, targetLang, sourceText }
    });

    res.json({ success: true });

  } catch (error) {
    console.error('Analyze request error:', error);
    res.status(500).json({ error: 'Failed to request analysis' });
  }
});

// 削除
router.delete('/:id', async (req, res) => {
  try {
    await prisma.job.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete job' });
  }
});

// メタデータ更新
router.patch('/:id', async (req, res) => {
  try {
    const job = await prisma.job.update({
      where: { id: req.params.id },
      data: req.body
    });
    res.json({ job });
  } catch (error) {
    res.status(500).json({ error: 'Update failed' });
  }
});

export default router;