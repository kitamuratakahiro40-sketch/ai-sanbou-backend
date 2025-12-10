'use server'

import { Storage } from '@google-cloud/storage';
import { auth } from '@/auth';

// GCSクライアントの初期化
const storage = new Storage({
  projectId: process.env.GCS_PROJECT_ID,
  credentials: {
    client_email: process.env.GCS_CLIENT_EMAIL,
    private_key: process.env.GCS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
});

const bucketName = process.env.GCS_BUCKET_NAME!;

export async function getPresignedUrl(fileName: string, contentType: string) {
  // 1. 認証チェック
  const session = await auth();
  if (!session || !session.user) {
    throw new Error('Unauthorized');
  }

  // 2. ファイル名の正規化 (UserID/Timestamp-Filename)
  const safeName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  const gcsPath = `${session.user.id}/${Date.now()}-${safeName}`;

  // 3. 署名付きURLの発行 (PUT用)
  const [url] = await storage
    .bucket(bucketName)
    .file(gcsPath)
    .getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 15 * 60 * 1000, // 15分間有効
      contentType,
    });

  return { url, gcsPath };
}