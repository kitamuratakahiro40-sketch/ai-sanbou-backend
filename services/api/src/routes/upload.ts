import { Router, Request, Response } from 'express';
import multer from 'multer';
import { Storage } from '@google-cloud/storage';
import { PrismaClient, JobStatus } from '@prisma/client';
import path from 'path';
import { geminiProcessor } from '../services/gemini';

const router = Router();
const prisma = new PrismaClient();

// ★削除: ここで初期化すると、環境変数の掃除が間に合わないことがある
// const storage = new Storage(); 

// Multer設定: メモリ保存
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB制限
  },
});

const bucketName = process.env.GCS_BUCKET_NAME;

async function getDevUserId(): Promise<string> {
  const existingUser = await prisma.user.findFirst();
  if (existingUser) return existingUser.id;

  const newUser = await prisma.user.create({
    data: {
      email: 'dev@example.com',
      name: 'Developer',
      plan: 'PRO',
    }
  });
  return newUser.id;
}

/**
 * POST /api/upload
 */
router.post('/', upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  try {
    // ★ここが最強の修正ポイント: 使う直前に「掃除」して「初期化」する
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS === "") {
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    }
    const storage = new Storage(); // ここで初期化すれば確実にADCが機能する

    // 1. ファイル有無チェック
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const file = req.file;
    const originalName = file.originalname;
    const gcsFileName = `${Date.now()}-${path.basename(originalName)}`;
    
    if (!bucketName) {
      throw new Error('Server configuration error: Bucket name missing');
    }

    // 2. Google Cloud Storageへのアップロード
    const bucket = storage.bucket(bucketName);
    const blob = bucket.file(gcsFileName);
    const blobStream = blob.createWriteStream({
      resumable: false,
      contentType: file.mimetype,
    });

    await new Promise((resolve, reject) => {
      blobStream.on('error', (err) => reject(err));
      blobStream.on('finish', () => resolve(true));
      blobStream.end(file.buffer);
    });

    const gcsUri = `gs://${bucketName}/${gcsFileName}`;
    console.log(`File uploaded to GCS: ${gcsUri}`);

    // ユーザーID取得
    const userId = await getDevUserId();

    // 3. データベース(Jobテーブル)への記録
  const job = await prisma.job.create({
  data: {
    fileName: originalName,
    // ▼ ここがDBの実際の列名と一致している必要があります
    // もし db pull で sourceUrl になったなら、ここも sourceUrl にします
    // (以前のコードでは sourceUrl になっていたので、そのままで動く可能性が高いです)
    sourceUrl: gcsUri, 
    
    status: JobStatus.UPLOADED,
    userId: userId,
  },
});

    // 4. AI処理開始
    geminiProcessor.processJob(job.id).catch(err => {
      console.error(`[Async AI Error] Job ${job.id}:`, err);
    });

    // 5. レスポンス返却
    res.status(200).json({
      message: 'File uploaded successfully',
      jobId: job.id,
      status: job.status,
      fileName: job.fileName
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ 
      error: 'Failed to upload file', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

export default router;