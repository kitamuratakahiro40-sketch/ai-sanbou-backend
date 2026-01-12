"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";

// 🌟 プロキシを回避する「直通の住所」
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api-service-649523701953.asia-northeast1.run.app';

interface Job {
  id: string;
  fileName: string;
  status: string;
  inputType: "AUDIO" | "TEXT";
  projectName?: string;
  createdAt: string;
  targetLang?: string; 
}

export default function JobDashboard() {
  const { data: session } = useSession();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchJobs = async () => {
    if (!session?.user?.id) {
       return;
    }

    try {
      const timestamp = Date.now();
      const userId = session.user.id;

      const res = await fetch(`${API_BASE_URL}/api/jobs?t=${timestamp}&userId=${userId}`, {
        mode: 'cors',
        cache: 'no-store',
        headers: {
          'Pragma': 'no-cache',
          'Cache-Control': 'no-cache'
        }
      });
      
      if (res.ok) {
        const data = await res.json();
        const jobsList = data.jobs || data; 
        
        if (Array.isArray(jobsList)) {
          setJobs(jobsList);
          setError("");
        } else {
          console.error("Data structure mismatch:", data);
          setJobs([]);
        }
      } else {
        console.error("Fetch failed:", res.status);
        if (res.status === 400) {
            setError("ユーザー認証エラー - 再ログインしてください");
        } else {
            setError("通信失敗 - 司令官からの応答がありません");
        }
      }
    } catch (error) {
      console.error("Failed to fetch jobs", error);
      setError("ネットワークエラー - Direct VPC の道筋を確認してください");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session?.user?.id) {
      fetchJobs();
    }
  }, [session]);

  useEffect(() => {
    const hasActiveJobs = jobs.some(
      (job) => job.status === 'PROCESSING' || job.status === 'QUEUED'
    );

    if (hasActiveJobs && session?.user?.id) {
      const intervalId = setInterval(() => {
        fetchJobs();
      }, 3000);
      return () => clearInterval(intervalId);
    }
  }, [jobs, session]);

  const getLangFlag = (lang?: string) => {
    if (lang === 'Thai') return '🇹🇭';
    if (lang === 'English') return '🇺🇸';
    return '🇯🇵';
  };

  // ★ 共通の案内メッセージコンポーネント
  const LanguageHint = () => (
    <div className="col-span-full mb-2 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-xl text-center space-y-1 shadow-sm">
      <p className="text-xs text-slate-600 font-bold">
        <span className="mr-2">💡</span>
        If you want the menu in Thai:
      </p>
      <p className="text-xs text-slate-500 font-medium">
        <span className="mr-2">🇺🇸</span>
        Please open this with Google Chrome and use the &quot;Translate to Thai&quot; feature.
      </p>
      <p className="text-xs text-slate-500 font-medium">
        <span className="mr-2">🇹🇭</span>
        กรุณาเปิดด้วย Google Chrome และคลิกขวาเพื่อเลือก &quot;แปลเป็นภาษาไทย&quot;
      </p>
    </div>
  );

  if (loading) return <div className="text-center text-slate-500 py-4 animate-pulse">戦況を読み込み中...</div>;
  
  if (error) {
    return (
      <div className="text-center text-red-400 py-8 bg-slate-900/50 rounded-xl border border-red-900/20 shadow-inner">
        <p className="font-bold">⚠️ {error}</p>
        <p className="text-xs text-slate-500 mt-2">API サーバーが正常に稼働しているか確認してください</p>
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="grid gap-4">
        {/* 履歴がなくても案内は出す */}
        <LanguageHint />
        
        <div className="text-center text-slate-500 py-16 bg-slate-900/30 rounded-xl border border-slate-800 border-dashed">
          <p className="text-lg">ミッション履歴なし</p>
          <p className="text-sm mt-2 opacity-60">新しい分析を開始して、知能を蓄積しましょう。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
      
      {/* ★ ここに案内メッセージを追加 */}
      <LanguageHint />

      {jobs.map((job) => (
        <Link 
          href={`/jobs/${job.id}`} 
          key={job.id}
          className="block bg-slate-900/50 p-5 rounded-xl border border-slate-800 hover:border-blue-500/50 hover:bg-slate-800 transition-all duration-300 group shadow-lg"
        >
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl bg-slate-800 border border-slate-700 group-hover:scale-110 transition-transform ${
                job.inputType === "AUDIO" ? "text-blue-400" : "text-purple-400"
              }`}>
                {job.inputType === "AUDIO" ? "🎙️" : "📝"}
              </div>
              
              <div>
                <div className="font-bold text-slate-200 text-lg group-hover:text-blue-300 transition-colors flex items-center gap-2">
                  {job.projectName || job.fileName || "Untitled Intelligence"}
                  <span className="text-sm bg-slate-800 px-2 py-0.5 rounded-full border border-slate-700 opacity-80" title={`Language: ${job.targetLang || 'Japanese'}`}>
                    {getLangFlag(job.targetLang)}
                  </span>
                </div>
                <div className="text-xs text-slate-500 font-mono mt-1">
                  ID: {job.id.slice(0, 8)} • {new Date(job.createdAt).toLocaleString('ja-JP')}
                </div>
              </div>
            </div>

            <div className={`px-4 py-1.5 rounded-full text-[10px] font-black tracking-widest border transition-all duration-700 ${
              job.status === "COMPLETED" ? "bg-green-500/10 text-green-400 border-green-500/20" :
              job.status === "PROCESSING" || job.status === "QUEUED" ? "bg-blue-500/10 text-blue-400 border-blue-500/20 animate-pulse" :
              job.status === "FAILED" ? "bg-red-500/10 text-red-400 border-red-500/20" :
              "bg-slate-800 text-slate-500 border-slate-700"
            }`}>
              {job.status}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}