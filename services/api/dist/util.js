import { Storage } from '@google-cloud/storage';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
const storage = new Storage();
const TMP = '/tmp';
export async function downloadToTmp(gcsUri) {
    const m = gcsUri.match(/^gs:\/\/([^\/]+)\/(.+)$/);
    if (!m)
        throw new Error('Invalid GCS URI');
    const bucket = m[1];
    const name = m[2];
    const tmpPath = path.join(TMP, `src-${Date.now()}-${name.split('/').pop()}`);
    await fs.mkdir(path.dirname(tmpPath), { recursive: true });
    await storage.bucket(bucket).file(name).download({ destination: tmpPath });
    return tmpPath;
}
export async function ffprobeDurationSeconds(localPath) {
    return new Promise((resolve, reject) => {
        const p = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', localPath]);
        let out = '';
        p.stdout.on('data', (d) => (out += String(d)));
        p.stderr.on('data', () => { });
        p.on('close', (code) => {
            if (code === 0) {
                const sec = parseFloat(out.trim());
                resolve(isFinite(sec) ? sec : 0);
            }
            else
                reject(new Error('ffprobe failed'));
        });
    });
}
