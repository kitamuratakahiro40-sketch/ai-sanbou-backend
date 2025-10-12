// services/api/src/tasks.ts
import { CloudTasksClient } from '@google-cloud/tasks';
const client = new CloudTasksClient();
const { PROJECT_ID, TASKS_LOCATION, TASKS_QUEUE, TASKS_SA_EMAIL, WORKER_URL, } = process.env;
if (!PROJECT_ID || !TASKS_LOCATION || !TASKS_QUEUE || !TASKS_SA_EMAIL || !WORKER_URL) {
    throw new Error('Missing env: PROJECT_ID/TASKS_LOCATION/TASKS_QUEUE/TASKS_SA_EMAIL/WORKER_URL');
}
function originOf(u) {
    return new URL(u).origin;
}
export async function enqueueTranscribeTask(payload) {
    const parent = client.queuePath(PROJECT_ID, TASKS_LOCATION, TASKS_QUEUE);
    // 必ず /tasks/transcribe にPOST
    const targetUrl = new URL('/tasks/transcribe', WORKER_URL).toString();
    const task = {
        httpRequest: {
            httpMethod: 'POST',
            url: targetUrl,
            headers: { 'Content-Type': 'application/json' },
            oidcToken: {
                serviceAccountEmail: TASKS_SA_EMAIL,
                audience: originOf(WORKER_URL),
            },
            body: Buffer.from(JSON.stringify(payload)).toString('base64'),
        },
        dispatchDeadline: { seconds: 600 },
    };
    const [res] = await client.createTask({ parent, task });
    return res.name ?? '';
}
/**
 * 後方互換：旧シグネチャ (jobId, chunkId, payload) でも動くようにする。
 * 既存の api.ts の呼び出しを変更せず、そのままビルド通過＆動作します。
 */
export function enqueueChunkTask(a, b, c) {
    // 新シグネチャ: enqueueChunkTask({ ...payload })
    if (typeof a === 'object' && a !== null && b === undefined && c === undefined) {
        return enqueueTranscribeTask(a);
    }
    // 旧シグネチャ: enqueueChunkTask(jobId, chunkId, payload)
    const jobId = a;
    const chunkId = b;
    const payload = (c ?? {});
    return enqueueTranscribeTask({ jobId, chunkId, ...payload });
}
