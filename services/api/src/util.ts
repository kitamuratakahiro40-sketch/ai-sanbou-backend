import { Storage } from "@google-cloud/storage";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
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

  const base = path.basename(name);
  const rand = crypto.randomBytes(6).toString("hex");
  const tmpPath = path.join(TMP, `src-${Date.now()}-${rand}-${base}`);

  try {
    const [exists] = await storage.bucket(bucket).file(name).exists();
    if (!exists) throw new Error(`GCS object not found: gs://${bucket}/${name}`);

    await storage.bucket(bucket).file(name).download({ destination: tmpPath });
    return tmpPath;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`downloadToTmp failed for gs://${bucket}/${name}:`, err);
    throw err;
  }
}

/**
 * ffprobe を呼んでメディアの長さ（秒）を返すユーティリティ
 * - ffprobe コマンドが PATH 上に必要（Cloud Run のイメージに ffprobe を含めること）
 * - 失敗した場合は 0 を返す（呼び出し側で扱いやすくするため）
 */
export async function ffprobeDurationSeconds(filePath: string): Promise<number> {
  if (!filePath) throw new Error("ffprobeDurationSeconds: filePath required");
  try {
    const { stdout } = (await execFileAsync("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath,
    ])) as { stdout: string; stderr: string };

    const s = stdout?.toString().trim();
    const v = parseFloat(s ?? "");
    if (isNaN(v)) {
      // eslint-disable-next-line no-console
      console.warn("ffprobeDurationSeconds: ffprobe returned non-numeric output", stdout);
      return 0;
    }
    return v;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("ffprobeDurationSeconds: failed to run ffprobe:", err);
    // 戻り値 0 は呼び出し側で扱いやすい（必要ならここで throw に変更）
    return 0;
  }
}