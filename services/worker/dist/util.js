import { Storage } from '@google-cloud/storage';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
const storage = new Storage();
const TMP = '/tmp';
export async function download(gcsUri, to) {
    const m = gcsUri.match(/^gs:\/\/([^\/]+)\/(.+)$/);
    if (!m)
        throw new Error('Invalid GCS URI');
    const bucket = m[1];
    const name = m[2];
    await fs.mkdir(path.dirname(to), { recursive: true });
    await storage.bucket(bucket).file(name).download({ destination: to });
}
export async function ffmpegExtract(inPath, outPath, start, end) {
    const duration = Math.max(0, end - start);
    if (duration <= 0)
        throw new Error('Invalid segment');
    await new Promise((resolve, reject) => {
        const args = ['-ss', String(start), '-t', String(duration), '-i', inPath, '-ac', '1', '-ar', '16000', '-f', 'wav', '-y', outPath];
        const p = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'inherit'] });
        p.on('close', (code) => (code === 0 ? resolve() : reject(new Error('ffmpeg failed'))));
    });
}
export const TMP_DIR = TMP;
