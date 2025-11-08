// 動的 import（ESMパッケージ対応）
async function getTasksClient() {
  const mod = await import('@google-cloud/tasks');
  return new mod.CloudTasksClient();
}

import type { TaskPayload as BaseTaskPayload } from './types/domain';

// ❌ これが原因（トップレベル await）
// const client = await getTasksClient();

const {
  PROJECT_ID,
  TASKS_LOCATION,
  TASKS_QUEUE,
  TASKS_SA_EMAIL,
  WORKER_URL,
} = process.env as Record<string, string | undefined>;

if (!PROJECT_ID || !TASKS_LOCATION || !TASKS_QUEUE || !TASKS_SA_EMAIL || !WORKER_URL) {
  throw new Error('Missing env: PROJECT_ID/TASKS_LOCATION/TASKS_QUEUE/TASKS_SA_EMAIL/WORKER_URL');
}

// 共有 TaskPayload を拡張（旧呼び出し互換用フィールド）
export type TranscribePayload = BaseTaskPayload & {
  chunkId?: string;
  startMs?: number;
  endMs?: number;
};

// 必要に応じて /tasks/transcribe を付与
function resolveTargetUrl(base: string): string {
  try {
    const u = new URL(base);
    if (!u.pathname || u.pathname === '/') {
      u.pathname = '/tasks/transcribe';
      return u.toString();
    }
    return u.toString();
  } catch {
    return base;
  }
}

// ★ 関数内で client を取得（ここなら await 可）
export async function enqueueTranscribeTask(payload: TranscribePayload): Promise<string> {
  const client = await getTasksClient();
  const parent = client.queuePath(PROJECT_ID!, TASKS_LOCATION!, TASKS_QUEUE!);

  const targetUrl = resolveTargetUrl(WORKER_URL!);

  const task = {
    httpRequest: {
      httpMethod: 'POST' as const,
      url: targetUrl,
      headers: { 'Content-Type': 'application/json' },
      oidcToken: {
        serviceAccountEmail: TASKS_SA_EMAIL!,
        audience: targetUrl,
      },
      body: Buffer.from(JSON.stringify(payload)),
    },
    dispatchDeadline: { seconds: 600 },
  };

  const [res] = await client.createTask({ parent, task });
  return res.name ?? '';
}

/**
 * 後方互換：旧シグネチャ (jobId, chunkId, payload) でも動作
 */
export function enqueueChunkTask(
  a: TranscribePayload | string,
  b?: string,
  c?: Omit<TranscribePayload, 'jobId' | 'chunkId'>
): Promise<string> {
  if (typeof a === 'object' && a !== null && b === undefined && c === undefined) {
    return enqueueTranscribeTask(a as TranscribePayload);
  }
  const jobId = a as string;
  const chunkId = b as string | undefined;
  const payload = (c ?? {}) as Omit<TranscribePayload, 'jobId' | 'chunkId'>;
  return enqueueTranscribeTask({ jobId, chunkId, ...(payload as any) });
}
