import { Storage } from "@google-cloud/storage";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

const storage = new Storage();
const TMP = os.tmpdir();

/**
 * gcsUri -> 一時ファイルのパスを返す
 * gcsUri 例: "gs://bucket/path/to/object" または "bucket/path/to/object"
 * Cloud Run では /tmp が書き込み可能（ただし永続化されない点に注意）
 */
export async function downloadToTmp(gcsUri: string): Promise<string> {
  if (!gcsUri) throw new Error("downloadToTmp: gcsUri is required");

  let bucket: string | undefined;
  let name: string | undefined;
  const m = gcsUri.match(/^(?:gs|gcs):\/\/([^/]+)\/(.+)$/);
  if (m) {
    bucket = m[1];
    name = m[2];
  } else {
    const m2 = gcsUri.match(/^([^/]+)\/(.+)$/);
    if (m2) {
      bucket = m2[1];
      name = m2[2];
    }
  }

  if (!bucket || !name) {
    throw new Error(`downloadToTmp: invalid gcsUri: ${gcsUri}`);
  }

  // 衝突回避のためランダム接尾辞を付与
  const base = path.basename(name);
  const rand = crypto.randomBytes(6).toString("hex");
  const tmpPath = path.join(TMP, `src-${Date.now()}-${rand}-${base}`);

  try {
    // 存在確認（失敗したら早期に分かる）
    const [exists] = await storage.bucket(bucket).file(name).exists();
    if (!exists) throw new Error(`GCS object not found: gs://${bucket}/${name}`);

    await storage.bucket(bucket).file(name).download({ destination: tmpPath });

    return tmpPath;
  } catch (err) {
    // ここでログを出す／ラップして再投げしておくと原因追跡が楽
    // eslint-disable-next-line no-console
    console.error(`downloadToTmp failed for gs://${bucket}/${name}:`, err);
    throw err;
  }
}
