'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import FileUploader from '@/components/FileUploader';
import JobDashboard from '@/components/JobDashboard';

export default function HomeClient({ session }: { session: any }) {
  const [showUploadModal, setShowUploadModal] = useState(false);

  return (
    <main className="min-h-screen bg-[#f5f5f7] p-8 font-sans">
      {/* ヘッダーエリア */}
      <div className="max-w-5xl mx-auto mb-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 relative bg-white rounded-xl shadow-sm flex items-center justify-center overflow-hidden">
             <img src="/logo.png" alt="AI参謀" className="w-full h-full object-contain" />
          </div>
          <div>
             <h1 className="text-2xl font-bold text-slate-800 tracking-tight leading-none">AI参謀</h1>
             <p className="text-xs text-slate-400 font-medium mt-1">
               {session?.user?.name || 'Guest'} さんの管理パネル
             </p>
          </div>
        </div>
        
        <button 
          onClick={() => setShowUploadModal(true)}
          className="bg-slate-900 text-white px-6 py-3 rounded-full font-bold shadow-lg hover:bg-slate-700 transition-all flex items-center gap-2 group"
        >
          <Plus size={20} className="group-hover:rotate-90 transition-transform"/> New Intelligence
        </button>
      </div>

      {/* メインコンテンツ：ジョブ一覧 (JobDashboardにお任せ) */}
      <div className="max-w-5xl mx-auto">
        <JobDashboard />
      </div>

      {/* アップロードモーダル (FileUploaderを使う) */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden border border-slate-700 relative">
            <button 
              onClick={() => setShowUploadModal(false)} 
              className="absolute top-4 right-4 text-slate-400 hover:text-white bg-slate-800 p-2 rounded-full transition z-10"
            >
              <X size={20}/>
            </button>
            
            <div className="p-8">
              <h2 className="text-xl font-bold text-white mb-6 text-center">新規分析ミッション</h2>
              {/* ここに、あのJSON対応済みのFileUploaderを表示！ */}
              <FileUploader onUploadComplete={() => setShowUploadModal(false)} />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}