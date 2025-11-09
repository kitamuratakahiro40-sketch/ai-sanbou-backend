// TaskPayload（後方互換版）
export type TaskPayload = {
  jobId: string;
  gcsUri: string;
  idx: number;
  startSec?: number;
  endSec?: number;

  // ここを任意に変更（必須→?）
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
