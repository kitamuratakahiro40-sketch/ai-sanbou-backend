"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Job {
  id: string;
  fileName: string;
  status: 'UPLOADED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  createdAt: string;
  transcript?: string;
  narrative?: string;
  summaryReport?: string;
  summaryActionJson?: string;
}

export default function JobDetail({ jobId }: { jobId: string }) {
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'narrative' | 'shield' | 'spear' | 'transcript'>('shield');
  const [copyStatus, setCopyStatus] = useState<string>('');

  // データ取得
  useEffect(() => {
    const fetchJob = async () => {
      try {
        // 個別の詳細データをAPIから取得する
        // services/api/src/index.ts で追加した GET /jobs/:id を利用
        const res = await fetch(`/api/proxy/jobs/${jobId}`);
        if (res.ok) {
          const data = await res.json();
          setJob(data);
        } else {
          console.error("Job fetch failed:", res.status);
        }
      } catch (error) {
        console.error("Failed to fetch job", error);
      } finally {
        setLoading(false);
      }
    };
    fetchJob();
  }, [jobId]);

  // コピー機能
  const handleCopy = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopyStatus('コピーしました！');
      setTimeout(() => setCopyStatus(''), 2000);
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-pulse flex flex-col items-center">
          <div className="h-12 w-12 bg-blue-200 rounded-full mb-4"></div>
          <div className="h-4 w-48 bg-gray-200 rounded"></div>
          <p className="mt-4 text-gray-500">参謀が資料を準備中...</p>
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800">データが見つかりません</h1>
          <Link href="/" className="text-blue-600 hover:underline mt-4 block">← ダッシュボードに戻る</Link>
        </div>
      </div>
    );
  }

  // 表示するコンテンツの決定
  let displayContent = "";
  let tabDescription = "";

  switch (activeTab) {
    case 'shield':
      displayContent = job.summaryReport || "（報告書はまだ生成されていません）";
      tabDescription = "本社報告用メールドラフト（編集して送信）";
      break;
    case 'spear':
      // JSONをパースしてToDoリストとして表示したいが、まずはコピー用に整形テキスト化
      try {
        const todos = JSON.parse(job.summaryActionJson || "[]");
        if (Array.isArray(todos)) {
            displayContent = todos.map((t: any) => 
                `□ ${t.who}: ${t.what} (期限: ${t.due})`
            ).join("\n");
        } else {
            displayContent = job.summaryActionJson || "";
        }
      } catch {
        displayContent = job.summaryActionJson || "（指示書はまだ生成されていません）";
      }
      tabDescription = "現場共有用 ToDoリスト";
      break;
    case 'narrative':
      displayContent = job.narrative || "（ナラティブ記録はまだ生成されていません）";
      tabDescription = "文脈を含む詳細議事録";
      break;
    case 'transcript':
      displayContent = job.transcript || "（文字起こしデータなし）";
      tabDescription = "AIによる文字起こし原文";
      break;
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* ヘッダー */}
      <header className="bg-white border-b sticky top-0 z-10 px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-gray-500 hover:bg-gray-100 p-2 rounded-full">
            ←
          </Link>
          <div>
            <h1 className="font-bold text-gray-800 truncate max-w-[200px] sm:max-w-md">
              {job.fileName}
            </h1>
            <p className="text-xs text-gray-500">{new Date(job.createdAt).toLocaleString()}</p>
          </div>
        </div>
        
        <div className={`px-2 py-1 text-xs rounded font-bold ${
            job.status === 'COMPLETED' ? 'bg-green-100 text-green-800' : 
            job.status === 'FAILED' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
        }`}>
            {job.status}
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4">
        {/* タブ切り替え */}
        <div className="flex overflow-x-auto gap-2 mb-4 pb-2 no-scrollbar">
          <button
            onClick={() => setActiveTab('shield')}
            className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-bold transition-colors ${
              activeTab === 'shield' 
                ? 'bg-blue-600 text-white shadow-md' 
                : 'bg-white text-gray-600 border hover:bg-gray-50'
            }`}
          >
            🛡️ 報告 (Shield)
          </button>
          <button
            onClick={() => setActiveTab('spear')}
            className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-bold transition-colors ${
              activeTab === 'spear' 
                ? 'bg-indigo-600 text-white shadow-md' 
                : 'bg-white text-gray-600 border hover:bg-gray-50'
            }`}
          >
            ⚔️ 指示 (Spear)
          </button>
          <button
            onClick={() => setActiveTab('narrative')}
            className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-bold transition-colors ${
              activeTab === 'narrative' 
                ? 'bg-emerald-600 text-white shadow-md' 
                : 'bg-white text-gray-600 border hover:bg-gray-50'
            }`}
          >
            📖 物語 (Narrative)
          </button>
          <button
            onClick={() => setActiveTab('transcript')}
            className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-bold transition-colors ${
              activeTab === 'transcript' 
                ? 'bg-gray-600 text-white shadow-md' 
                : 'bg-white text-gray-600 border hover:bg-gray-50'
            }`}
          >
            📝 原文
          </button>
        </div>

        {/* コンテンツエリア */}
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          {/* ツールバー */}
          <div className="bg-gray-50 px-4 py-3 border-b flex justify-between items-center">
            <p className="text-sm text-gray-500 font-medium">
              {tabDescription}
            </p>
            
            {/* コピーボタン（PC用） */}
            <button 
                onClick={() => handleCopy(displayContent)}
                className="hidden sm:flex items-center gap-2 text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded transition-colors text-sm font-bold"
            >
                {copyStatus || (
                    <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                        コピーする
                    </>
                )}
            </button>
          </div>

          {/* テキスト表示エリア */}
          <div className="p-0">
            <textarea
              readOnly
              value={displayContent}
              className="w-full h-[60vh] p-4 resize-none outline-none text-gray-800 text-base leading-relaxed font-mono bg-transparent"
              style={{ minHeight: '400px' }}
            />
          </div>
        </div>
      </main>

      {/* モバイル用フローティングコピーボタン */}
      <div className="fixed bottom-6 right-6 sm:hidden">
        <button
          onClick={() => handleCopy(displayContent)}
          className="bg-blue-600 hover:bg-blue-700 text-white rounded-full p-4 shadow-lg flex items-center justify-center transition-transform active:scale-95"
        >
          {copyStatus ? (
             <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
          ) : (
             <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
          )}
        </button>
      </div>
    </div>
  );
}