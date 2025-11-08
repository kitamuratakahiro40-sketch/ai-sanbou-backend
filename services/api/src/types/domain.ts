// 必要な型を最低限ここに置く（後で共通化OK）
export type TaskPayload = {
  jobId: string;
  gcsUri: string;
  idx: number;
  startSec?: number;
  endSec?: number;

  // オプション類（必要に応じて拡張）
  schemaVersion?: 1;
  options?: {
    languageHint?: string[];
    priority?: 'high' | 'normal' | 'low';
    timeoutSec?: number;
  };
  trace?: {
    requestedBy?: string;   // 例: "scribe-api"
    enqueueTs?: number;     // Unix epoch seconds
  };
};
