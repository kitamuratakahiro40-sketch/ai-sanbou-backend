import { Router, Request, Response } from 'express';
import { Storage } from '@google-cloud/storage';

const router = Router();
const storage = new Storage();

// ★重要: バケット名は jobs.ts に書いたものと合わせる必要があります
// もしGCSのバケット名が違う場合は、ここを書き換えてください
const BUCKET_NAME = process.env.GCS_BUCKET_NAME || 'sanbou-ai-transcripts';

router.post('/signed-url', async (req: Request, res: Response) => {
  try {
    const { fileName, fileType } = req.body;

    // ガード: ファイル名がない場合はエラー
    if (!fileName) {
      console.error('❌ [Upload] FileName is missing');
      return res.status(400).json({ error: 'FileName is required' });
    }

    console.log(`🎫 [Upload] Generating Signed URL for: ${fileName}`);

    const bucket = storage.bucket(BUCKET_NAME);
    const file = bucket.file(fileName);

    // 署名付きURLの発行 (有効期限: 15分)
    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 15 * 60 * 1000, 
      contentType: fileType || 'application/octet-stream',
    });

    // フロントエンドに返す (uploadUrl と fileName)
    return res.json({ uploadUrl: url, fileName });

  } catch (error: any) {
    console.error('❌ [Upload] Signed URL Error:', error);
    return res.status(500).json({ error: 'Failed to generate Signed URL', detail: error.message });
  }
});

export default router;