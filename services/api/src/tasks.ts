// services/api/src/tasks.ts
import { CloudTasksClient } from '@google-cloud/tasks';

const client = new CloudTasksClient();

const {
  PROJECT_ID,
  TASKS_LOCATION,
  TASKS_QUEUE,
  TASKS_SA_EMAIL,
  WORKER_URL,
} = process.env as Record<string, string | undefined>;

if (!PROJECT_ID || !TASKS_LOCATION || !TASKS_QUEUE || !TASKS_SA_EMAIL || !WORKER_URL) {
  throw new Error(
    'Missing env: PROJECT_ID/TASKS_LOCATION/TASKS_QUEUE/TASKS_SA_EMAIL/WORKER_URL'
  );
}

function originOf(u: string) {
  return new URL(u).origin;
}

export type TranscribePayload = {
  jobId: string;
  chunkId?: string;
  gcsUri: string;
  startMs?: number;
  endMs?: number;
  languageHint?: string;
};

export async function enqueueTranscribeTask(
  payload: TranscribePayload
): Promise<string> {
  const parent = client.queuePath(PROJECT_ID!, TASKS_LOCATION!, TASKS_QUEUE!);

  // 必ず /tasks/transcribe にPOST
  const targetUrl = new URL('/tasks/transcribe', WORKER_URL!).toString();

  const task = {
    httpRequest: {
      httpMethod: 'POST' as const,
      url: targetUrl,
      headers: { 'Content-Type': 'application/json' },
      oidcToken: {
        serviceAccountEmail: TASKS_SA_EMAIL!,
        audience: originOf(WORKER_URL!),
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
export function enqueueChunkTask(
  a: TranscribePayload | string,
  b?: string,
  c?: Omit<TranscribePayload, 'jobId' | 'chunkId'>
): Promise<string> {
  // 新シグネチャ: enqueueChunkTask({ ...payload })
  if (typeof a === 'object' && a !== null && b === undefined && c === undefined) {
    return enqueueTranscribeTask(a as TranscribePayload);
  }
  // 旧シグネチャ: enqueueChunkTask(jobId, chunkId, payload)
  const jobId = a as string;
  const chunkId = b as string | undefined;
  const payload = (c ?? {}) as Omit<TranscribePayload, 'jobId' | 'chunkId'>;

  return enqueueTranscribeTask({ jobId, chunkId, ...(payload as any) });
}
