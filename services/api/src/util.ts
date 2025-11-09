import { Storage } from "@google-cloud/storage";
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const storage = new Storage();
const TMP = os.tmpdir();

/**
 * downloadToTmp: GCS オブジェクトを一時ファイルにダウンロードしてパスを返す
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
 * ffprobe の実行パスを決定する
 * - まず ffprobe-static があればそれを使う（バイナリの絶対パス）
 * - なければ PATH 上の "ffprobe" を使う
 */
let ffprobeExec = "ffprobe";
try {
  // require を使って柔軟にロード（TypeScript の型エラー回避）
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ffprobeStatic = require("ffprobe-static");
  if (ffprobeStatic) {
    // ffprobe-static は string か { path: string } を返す実装があるため両方対応
    ffprobeExec = (ffprobeStatic.path ?? ffprobeStatic) as string;
  }
} catch (e) {
  // ffprobe-static が無くても PATH 上の ffprobe を使うためフォールバック
  ffprobeExec = "ffprobe";
}

/**
 * ffprobe を実行してメディア長（秒）を返す
 * - ffprobe が使えない場合やエラー時は 0 を返す（呼び出し側で扱いやすくするため）
 */
export async function ffprobeDurationSeconds(filePath: string): Promise<number> {
  if (!filePath) throw new Error("ffprobeDurationSeconds: filePath required");
  try {
    const { stdout } = (await execFileAsync(ffprobeExec, [
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
    return 0;
  }
}