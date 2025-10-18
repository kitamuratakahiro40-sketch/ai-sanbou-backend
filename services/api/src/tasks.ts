import { CloudTasksClient } from '@google-cloud/tasks';
import type { TaskPayload as BaseTaskPayload } from 'src/types/domain.js';

const client = new CloudTasksClient();

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

// 必要に応じて /tasks/transcribe を付与（WORKER_URL が既にフルパスならそのまま）
function resolveTargetUrl(base: string): string {
  try {
    const u = new URL(base);
    if (!u.pathname || u.pathname === '/' ) {
      u.pathname = '/tasks/transcribe';
      return u.toString();
    }
    return u.toString(); // 既にパスあり → そのまま使う
  } catch {
    // 万一不正なURLなら素直にそのまま返す（環境変数を直すべきケース）
    return base;
  }
}

export async function enqueueTranscribeTask(payload: TranscribePayload): Promise<string> {
  const parent = client.queuePath(PROJECT_ID!, TASKS_LOCATION!, TASKS_QUEUE!);

  // 最終的に叩くURL（/tasks/transcribe を自動補完）
  const targetUrl = resolveTargetUrl(WORKER_URL!);

  const task = {
    httpRequest: {
      httpMethod: 'POST' as const,
      url: targetUrl,
      headers: { 'Content-Type': 'application/json' },
      oidcToken: {
        serviceAccountEmail: TASKS_SA_EMAIL!,
        // Cloud Run の OIDC は「実際に叩くURL」と合わせるのが無難
        audience: targetUrl,
      },
      // ✅ Buffer を渡す（SDKがBase64化）
      body: Buffer.from(JSON.stringify(payload)),
    },
    // 処理上限（必要に応じて調整）
    dispatchDeadline: { seconds: 600 },
    // scheduleTime を使う場合はここに追加
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
