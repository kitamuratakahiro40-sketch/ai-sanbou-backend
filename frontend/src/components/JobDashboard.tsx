"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react"; // ★追加

interface Job {
  id: string;
  fileName: string;
  status: string;
  inputType: "AUDIO" | "TEXT";
  targetName?: string;
  createdAt: string;
}

export default function JobDashboard() {
  const { data: session } = useSession(); // ★追加
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchJobs = async () => {
    // セッションがない（ロード中含む）場合はスキップ
    if (!session) return;

    try {
      const timestamp = Date.now();
      const res = await fetch(`/api/jobs?t=${timestamp}`, {
        cache: 'no-store',
        headers: {
          // ★ここでもトークンを送る
          'Authorization': `Bearer ${session?.user?.id || 'dummy-token'}`,
        }
      });
      
      if (res.ok) {
        const data = await res.json();
        setJobs(data);
      } else {
         console.error("Fetch failed:", res.status);
      }
    } catch (error) {
      console.error("Failed to fetch jobs", error);
    } finally {
      setLoading(false);
    }
  };

  // 初回ロード（セッションが確定したら走る）
  useEffect(() => {
    if (session) {
        fetchJobs();
    }
  }, [session]); // sessionが変わったら実行

  // 自動更新ロジック
  useEffect(() => {
    if (!session) return; // ログインしてなければ自動更新もしない

    const hasActiveJobs = jobs.some(
      (job) => job.status === 'PROCESSING' || job.status === 'UPLOADED'
    );

    if (hasActiveJobs) {
      const intervalId = setInterval(() => {
        fetchJobs();
      }, 3000);
      return () => clearInterval(intervalId);
    }
  }, [jobs, session]);

  if (!session) return <div>ログインしてください</div>; // ログイン待ち
  if (loading) return <div className="text-center text-slate-500 py-4">Loading jobs...</div>;
  if (jobs.length === 0) return <div className="text-center text-slate-500 py-10 bg-slate-800 rounded-lg">データがありません</div>;

  return (
    // ... (ここから下の return の中身は変更なし。そのままでOKです) ...
    <div className="grid gap-4">
      {jobs.map((job) => (
        <Link 
          href={`/jobs/${job.id}`} 
          key={job.id}
          className="block bg-slate-800 p-4 rounded-lg border border-slate-700 hover:border-blue-500 hover:bg-slate-700 transition group"
        >
          {/* 中身は元のまま */}
           <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{job.inputType === "AUDIO" ? "🎙️" : "📝"}</span>
              <div>
                <div className="font-bold text-slate-200 group-hover:text-blue-300">
                  {job.targetName || job.fileName || "Untitled Job"}
                </div>
                <div className="text-xs text-slate-500">
                  {new Date(job.createdAt).toLocaleString()}
                </div>
              </div>
            </div>
            <div className={`px-3 py-1 rounded-full text-xs font-bold transition-colors duration-500 ${
              job.status === "COMPLETED" ? "bg-green-900 text-green-300 border border-green-700" :
              job.status === "PROCESSING" ? "bg-yellow-900 text-yellow-300 border border-yellow-700 animate-pulse" :
              "bg-gray-700 text-slate-300"
            }`}>
              {job.status}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}