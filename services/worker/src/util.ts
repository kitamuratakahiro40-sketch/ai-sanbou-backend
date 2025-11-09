import { Storage } from '@google-cloud/storage';
import { spawn } from 'child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const storage = new Storage();
const TMP = '/tmp';

export async function download(gcsUri: string, to: string): Promise<void> {
  const m = gcsUri.match(/^gs:\/\/([^\/]+)\/(.+)$/);
  if (!m) throw new Error('Invalid GCS URI');
  const bucket = m[1];
  const name = m[2];
  await fs.mkdir(path.dirname(to), { recursive: true });
  if (!name) throw new Error("util.download: name is required");
if (!bucket) throw new Error("util.download: bucket is required");
if (!name) throw new Error("util.download: name is required");
if (!bucket) throw new Error("util.download: bucket is required");
await storage.bucket(String(bucket)).file(String(name)).download({ destination: to });

}

export async function ffmpegExtract(inPath: string, outPath: string, start: number, end: number): Promise<void> {
  const duration = Math.max(0, end - start);
  if (duration <= 0) throw new Error('Invalid segment');
  await new Promise<void>((resolve, reject) => {
    const args = ['-ss', String(start), '-t', String(duration), '-i', inPath, '-ac', '1', '-ar', '16000', '-f', 'wav', '-y', outPath];
    const p = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'inherit'] });
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error('ffmpeg failed'))));
  });
}

export const TMP_DIR = TMP;