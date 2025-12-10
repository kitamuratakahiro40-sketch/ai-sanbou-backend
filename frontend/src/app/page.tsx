"use client";

import React, { useState, useEffect } from 'react';
import { Search, Loader2 } from 'lucide-react';
// ▼ Firebaseの useAuth ではなく、NextAuth を使います
import { useSession, signIn } from "next-auth/react"; 
import { JobCard } from '../components/JobCard';
// パスエラーが出る場合は ../components/... を確認してください
import { MobileFloatingAction } from '../components/MobileFloatingAction';

export default function Dashboard() {
  // ▼ NextAuth のフック
  const { data: session, status } = useSession();
  
  // 以前の変数名に合わせる
  const user = session?.user;
  const authLoading = status === "loading";
  const login = () => signIn("google");

  const [jobs, setJobs] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchJobs = async () => {
      if (status !== "authenticated") return;
      
      setIsLoading(true);
      try {
        const queryParams = new URLSearchParams();
        if (searchQuery) queryParams.set('q', searchQuery);

        // API呼び出し (ヘッダー不要)
        const res = await fetch(`/api/jobs?${queryParams.toString()}`);
        
        if (res.ok) {
          const data = await res.json();
          setJobs(Array.isArray(data) ? data : data.jobs || []);
        }
      } catch (error) {
        console.error("Failed to fetch jobs", error);
      } finally {
        setIsLoading(false);
      }
    };

    const timer = setTimeout(() => {
      if (user) fetchJobs();
    }, 500);

    return () => clearTimeout(timer);
  }, [status, searchQuery, user]);

  if (authLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin text-indigo-600" size={40} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen flex flex-col items-center justify-center p-6 text-center bg-gradient-to-br from-indigo-900 to-slate-900 text-white">
        <div className="mb-6 p-4 bg-white/10 rounded-full backdrop-blur-sm">
           <span className="text-4xl">🤖</span>
        </div>
        <h1 className="text-4xl font-bold mb-4 tracking-tight">Sanbou AI</h1>
        <p className="mb-8 text-indigo-200 text-lg max-w-sm mx-auto">
          経営判断に資する、<br/>あなただけのAI参謀。
        </p>
        <button 
          onClick={() => login()} 
          className="bg-white text-indigo-900 px-8 py-4 rounded-full font-bold shadow-xl active:scale-95 transition-all flex items-center gap-2 hover:bg-indigo-50"
        >
          <img src="https://www.google.com/favicon.ico" alt="G" className="w-5 h-5" />
          Googleでログイン
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-32">
      <div className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-gray-200 px-4 py-3 shadow-sm safe-top">
        <div className="max-w-md mx-auto flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" 
              placeholder="参謀検索 (キーワード...)" 
              className="w-full bg-gray-100 text-gray-900 rounded-full pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="w-8 h-8 rounded-full bg-indigo-100 border border-indigo-200 overflow-hidden">
            {user.image ? (
              <img src={user.image} alt="User" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-indigo-600 font-bold text-xs">
                {user.name?.[0]}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto p-4">
        <div className="flex justify-between items-end mb-4 px-1">
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Mission Log</h2>
          <span className="text-xs font-mono text-gray-400">
            {isLoading ? 'Syncing...' : `${jobs.length} RECORDS`}
          </span>
        </div>

        {isLoading && jobs.length === 0 ? (
          <div className="flex justify-center py-12">
            <Loader2 className="animate-spin text-indigo-400" size={32} />
          </div>
        ) : jobs.length > 0 ? (
          <div className="space-y-3">
            {jobs.map((job: any) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        ) : (
           <div className="text-center py-20 px-6">
             <div className="bg-gray-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
               <Search className="text-gray-400" size={24}/>
             </div>
             <p className="text-gray-900 font-medium">データが見つかりません</p>
           </div>
        )}
      </div>
      <MobileFloatingAction />
    </div>
  );
}