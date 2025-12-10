// frontend/src/types/index.ts

export interface Job {
  id: string;
  audioUrl: string;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  
  // AI生成データ
  narrative?: string | null;
  risks?: string | null;
  score?: number | null;
  
  createdAt: Date;

  // Phase 2: 認証・管理用に追加
  userId?: string | null;
  projectId?: string | null;
}

// 将来使うプロジェクト型
export interface Project {
  id: string;
  name: string;
  description?: string | null;
  userId: string;
}