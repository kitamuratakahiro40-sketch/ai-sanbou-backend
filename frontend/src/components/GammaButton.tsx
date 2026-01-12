"use client";

import React, { useState, useEffect } from 'react';
import { MonitorPlay, Download, ExternalLink, Loader2, AlertCircle, Gift, FileText } from 'lucide-react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api-service-649523701953.asia-northeast1.run.app';
const REFERRAL_LINK = "https://gamma.app/signup?r=YOUR_REFERRAL_CODE"; 

interface GammaButtonProps {
  jobId: string;
}

export default function GammaButton({ jobId }: GammaButtonProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'completed' | 'error'>('idle');
  const [downloadUrl, setDownloadUrl] = useState(''); // PDFのURL
  const [gammaUrl, setGammaUrl] = useState('');       // WebのURL
  const [pageCount, setPageCount] = useState(3);
  const [debugMsg, setDebugMsg] = useState('');

  useEffect(() => { return () => {}; }, []);

  const handleGenerate = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setStatus('loading');
    setDebugMsg('🚀 Requesting...');
    
    try {
      const res = await fetch(`${API_BASE_URL}/api/gamma/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, pageCount })
      });
      
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Generation failed");

      const finalGammaId = data.gammaId || data.rawResult?.generationId || data.rawResult?.id;
      if (!finalGammaId || finalGammaId === "undefined") throw new Error("ID Missing");

      setDebugMsg(`⏳ Started: ${finalGammaId}`);
      pollStatus(finalGammaId);

    } catch (err: any) {
      console.error(err);
      setStatus('error');
      setDebugMsg(err.message);
    }
  };

  const pollStatus = async (gammaId: string) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/gamma/status/${gammaId}`);
        const data = await res.json();
        setDebugMsg("Processing...");

        // 完了判定: exportUrl (PDF) または gammaUrl (Web) があればOK
        if (data.exportUrl || data.gammaUrl) {
          clearInterval(interval);
          setDownloadUrl(data.exportUrl || data.file_url || ''); // PDFリンク
          setGammaUrl(data.gammaUrl || data.url || '');          // Webリンク
          setStatus('completed');
        } 
        else if (data.status === 'error') {
          clearInterval(interval);
          setStatus('error');
        }
      } catch (err) {
        clearInterval(interval);
        setStatus('error');
      }
    }, 3000); 
  };

  if (status === 'completed') {
    return (
      <div className="animate-in fade-in zoom-in duration-300 space-y-4 p-2">
        
        {/* === 2つのメインボタン === */}
        <div className="grid grid-cols-2 gap-3">
            {/* 左: Webで見る (編集・紹介導線) */}
            <a 
            href={gammaUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex flex-col items-center justify-center gap-2 bg-white border-2 border-indigo-100 hover:border-indigo-500 text-indigo-700 p-4 rounded-xl transition-all group"
            >
            <ExternalLink size={24} className="group-hover:scale-110 transition-transform mb-1"/>
            <div className="text-center">
                <span className="block text-sm font-bold">Webで見る</span>
                <span className="block text-[10px] text-slate-400">編集・PPT化はこちら</span>
            </div>
            </a>

            {/* 右: PDF保存 (登録不要・即ダウンロード) */}
            {downloadUrl ? (
                <a 
                href={downloadUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex flex-col items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white p-4 rounded-xl shadow-lg transition-all group"
                >
                <FileText size={24} className="group-hover:scale-110 transition-transform mb-1"/>
                <div className="text-center">
                    <span className="block text-sm font-bold">PDFを保存</span>
                    <span className="block text-[10px] text-emerald-100/80">登録不要・文字崩れなし</span>
                </div>
                </a>
            ) : (
                <div className="flex flex-col items-center justify-center gap-2 bg-slate-100 text-slate-400 p-4 rounded-xl">
                    <Loader2 size={24} className="animate-spin"/>
                    <span className="text-[10px]">PDF準備中...</span>
                </div>
            )}
        </div>

        {/* 下: マネタイズ導線 (Webを選んだ人向け) */}
        <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg text-center">
            <a 
                href={REFERRAL_LINK} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-xs inline-flex items-center gap-1 text-purple-600 hover:text-purple-800 font-bold underline decoration-purple-300"
            >
                <Gift size={12}/>
                <span>Gammaアカウント登録で特典クレジットGet</span>
            </a>
        </div>
      </div>
    );
  }

  if (status === 'loading') {
    return (
      <div className="bg-slate-100 border border-slate-200 text-slate-500 w-full py-4 rounded-lg flex flex-col items-center justify-center gap-2 cursor-wait">
        <Loader2 className="animate-spin text-indigo-600" size={24} />
        <span className="font-mono text-xs font-bold mt-2">Gamma AIが資料を作成中...</span>
        <span className="text-[10px] text-slate-400">約30秒〜1分お待ちください</span>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="bg-red-50 text-red-500 border border-red-200 w-full py-3 rounded-lg flex flex-col items-center justify-center gap-1">
        <div className="flex items-center gap-2"><AlertCircle size={18} /><span className="font-bold text-sm">エラー発生</span></div>
        <code className="text-[10px] text-red-400 max-w-[90%] break-all">{debugMsg}</code>
        <button onClick={() => setStatus('idle')} className="underline text-xs mt-1">再試行</button>
      </div>
    );
  }

  return (
    <div className="bg-white p-5 rounded-xl border border-indigo-100 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600"><MonitorPlay size={20} /></div>
        <div>
            <h4 className="font-bold text-slate-700 text-sm">AIスライド作成</h4>
            <p className="text-[10px] text-slate-400">構成案をもとにデザイン付き資料を生成します</p>
        </div>
      </div>
      <div className="flex gap-2">
        <select 
            value={pageCount} 
            onChange={(e) => setPageCount(Number(e.target.value))} 
            className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg px-3 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
        >
            <option value={1}>1枚 (速報)</option>
            <option value={2}>2枚 (概要)</option>
            <option value={3}>3枚 (標準)</option>
            <option value={4}>4枚 (詳細)</option>
            <option value={5}>5枚 (完全)</option>
        </select>
        
        <button onClick={handleGenerate} className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white py-3 rounded-lg font-bold shadow transition-all flex items-center justify-center gap-2 group">
            <MonitorPlay size={18} className="group-hover:scale-110 transition-transform"/><span>生成開始</span>
        </button>
      </div>
    </div>
  );
}