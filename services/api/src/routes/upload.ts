import { Router, Request, Response } from 'express';
import { Storage } from '@google-cloud/storage';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
const storage = new Storage();
const BUCKET_NAME = process.env.GCS_BUCKET_NAME || 'sanbou-ai-transcripts-ap1';

router.post('/signed-url', async (req: Request, res: Response): Promise<void> => {
  try {
    const { fileName, fileType } = req.body;
    
    if (!fileName) {
      res.status(400).json({ error: 'fileName is required' });
      return;
    }

    const uniqueFileName = `${Date.now()}-${uuidv4()}-${fileName}`;
    const file = storage.bucket(BUCKET_NAME).file(uniqueFileName);

    const options = {
      version: 'v4' as const,
      action: 'write' as const,
      expires: Date.now() + 15 * 60 * 1000, 
      contentType: fileType || 'application/octet-stream',
    };

    const [url] = await file.getSignedUrl(options);

    console.log(`🔑 Signed URL generated for: ${uniqueFileName}`);

    res.json({
      uploadUrl: url,
      storagePath: `gs://${BUCKET_NAME}/${uniqueFileName}`,
      fileName: uniqueFileName
    });

  } catch (error) {
    console.error('Error generating signed URL:', error);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});

export default router;