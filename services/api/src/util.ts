import { Storage } from '@google-cloud/storage';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';

const storage = new Storage();
const TMP = '/tmp';

// --- 例: services/api/src/util.ts の downloadToTmp ---
export async function downloadToTmp(gcsUri: string): Promise<string> {
  if (!gcsUri) throw new Error("downloadToTmp: gcsUri is required");

  // gcsUri 形式: gs://bucket/path/to/object  または bucket/path/to/object
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

  // 一時ファイル名を作成してダウンロード
  const base = path.basename(name);
  const tmpPath = path.join(TMP, `src-${Date.now()}-${base}`);

  await storage.bucket(bucket).file(name).download({ destination: tmpPath });

  // 重要: Promise<string> を返す
  return tmpPath;
}


export async function ffprobeDurationSeconds(localPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const p = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', localPath]);
    let out = '';
    p.stdout.on('data', (d) => (out += String(d)));
    p.stderr.on('data', () => {});
    p.on('close', (code) => {
      if (code === 0) {
        const sec = parseFloat(out.trim());
        resolve(isFinite(sec) ? sec : 0);
      } else reject(new Error('ffprobe failed'));
    });
  });
}