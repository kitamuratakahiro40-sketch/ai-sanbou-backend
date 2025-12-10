import { Storage } from "@google-cloud/storage";

// ADCにより、Cloud Run上では自動認証、ローカルでは gcloud auth login の情報が使われます
const storage = new Storage();

// バケット名は環境変数で管理するのがベストです
const BUCKET_NAME = process.env.GCS_BUCKET_NAME || "ai-sanbou-storage";

export async function uploadFileToGCS(
  fileBuffer: Buffer,
  fileName: string,
  contentType: string
): Promise<string> {
  const bucket = storage.bucket(BUCKET_NAME);
  const file = bucket.file(fileName);

  await file.save(fileBuffer, {
    metadata: { contentType },
  });

  // 公開URLが必要な場合（バケットが公開設定の場合）
  // return `https://storage.googleapis.com/${BUCKET_NAME}/${fileName}`;
  
  // 署名付きURL（期限付きURL）を発行する場合などの処理をここに書けます
  return file.name; // ファイル名を返す
}