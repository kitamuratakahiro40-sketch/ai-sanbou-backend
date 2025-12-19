'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Upload, Plus, Search, FileText, X } from 'lucide-react';

const API_BASE = 'http://192.168.0.248:3001/api/jobs';

export default function Home() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState(''); // TOP検索用
  const [isUploading, setIsUploading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false); // モーダル開閉

  // 新規作成用のState
  const [uploadTab, setUploadTab] = useState<'FILE' | 'TEXT'>('FILE');
  const [file, setFile] = useState<File | null>(null);
  const [textInput, setTextInput] = useState('');
  const [projectName, setProjectName] = useState('');

  const fetchJobs = async () => {
    try {
      const res = await fetch(API_BASE, { mode: 'cors' });
      const data = await res.json();
      setJobs(data.jobs || []);
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, 5000);
    return () => clearInterval(interval);
  }, []);

  // アップロード or テキスト送信処理
  const handleCreateJob = async () => {
    if (uploadTab === 'FILE' && !file) return alert('ファイルを選択してください');
    if (uploadTab === 'TEXT' && !textInput.trim()) return alert('テキストを入力してください');

    setIsUploading(true);
    const formData = new FormData();
    
    // 共通
    formData.append('projectName', projectName || (uploadTab === 'FILE' ? file?.name || 'Untitled' : 'Text Note'));
    
    if (uploadTab === 'FILE' && file) {
      formData.append('file', file);
      formData.append('type', 'AUDIO'); // デフォルト（サーバー側でmime type判定推奨）
    } else {
      formData.append('rawText', textInput);
      formData.append('type', 'TEXT');
    }

    try {
      const res = await fetch(API_BASE, {
        method: 'POST',
        body: formData, // mode: 'cors' は不要(デフォルト)
      });
      if (res.ok) {
        setShowUploadModal(false);
        setFile(null);
        setTextInput('');
        setProjectName('');
        fetchJobs();
      } else {
        alert('Upload failed');
      }
    } catch (e) {
      console.error(e);
      alert('Error occurred');
    } finally {
      setIsUploading(false);
    }
  };

  // 検索フィルタリング（タイトル、クライアント、タグで検索）
  const filteredJobs = jobs.filter(job => {
    const q = searchQuery.toLowerCase();
    return (
      (job.projectName || job.fileName || '').toLowerCase().includes(q) ||
      (job.clientName || '').toLowerCase().includes(q) ||
      (job.tags || '').toLowerCase().includes(q)
    );
  });

  return (
    <main className="min-h-screen bg-[#f5f5f7] p-8 font-sans">
{/* ヘッダーエリア */}
      <div className="max-w-5xl mx-auto mb-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          
          {/* ★ロゴ画像モード */}
          <div className="w-12 h-12 relative">
             {/* publicフォルダの logo.png を読み込みます */}
             <img src="/logo.png" alt="AI参謀 Logo" className="w-full h-full object-contain" />
          </div>

          <div>
             <h1 className="text-2xl font-bold text-slate-800 tracking-tight leading-none">AI参謀</h1>
             <p className="text-xs text-slate-400 font-medium">Sanbou-AI v2.0</p>
          </div>
        </div>
        
        <button 
          onClick={() => setShowUploadModal(true)}
          className="bg-slate-900 text-white px-6 py-3 rounded-full font-bold shadow-lg hover:bg-slate-700 transition-all flex items-center gap-2 hover:shadow-xl hover:-translate-y-0.5"
        >
          <Plus size={20} /> New Intelligence
        </button>
      </div>

      {/* ★TOP検索バー */}
      <div className="max-w-5xl mx-auto mb-10 sticky top-4 z-10">
        <div className="relative shadow-md rounded-2xl">
          <Search className="absolute left-4 top-3.5 text-slate-400" size={20} />
          <input 
            type="text" 
            className="w-full pl-12 pr-4 py-3 bg-white rounded-2xl border-none outline-none text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500" 
            placeholder="Search intelligence... (Project, Client, Tags)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* ジョブリスト */}
      <div className="max-w-5xl mx-auto space-y-4">
        {filteredJobs.length > 0 ? (
          filteredJobs.map((job) => (
            <Link key={job.id} href={`/jobs/${job.id}`}>
              <div className="group bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 relative overflow-hidden">
                <div className={`absolute top-0 left-0 w-1 h-full ${job.status === 'COMPLETED' ? 'bg-green-400' : 'bg-blue-400 animate-pulse'}`}></div>
                <div className="flex justify-between items-center">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                       {job.status === 'COMPLETED' ? <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded">COMPLETED</span> : <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded animate-pulse">PROCESSING</span>}
                       <span className="text-xs text-slate-400">{new Date(job.createdAt).toLocaleString()}</span>
                    </div>
                    <h2 className="text-lg font-bold text-slate-800 group-hover:text-blue-600 transition-colors">{job.projectName || job.fileName}</h2>
                    {job.clientName && <p className="text-sm text-slate-500 mt-1 font-medium">🏢 {job.clientName}</p>}
                    {job.tags && <div className="flex gap-2 mt-3">{job.tags.split(',').map((t:string, i:number) => <span key={i} className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded">#{t.trim()}</span>)}</div>}
                  </div>
                  <div className="text-slate-300 group-hover:text-blue-500">→</div>
                </div>
              </div>
            </Link>
          ))
        ) : (
          <div className="text-center py-20 text-slate-400">
            {searchQuery ? 'No matching intelligence found.' : 'No intelligence yet. Create one!'}
          </div>
        )}
      </div>

      {/* ★新規作成モーダル */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-4 border-b flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-700">New Intelligence</h3>
              <button onClick={() => setShowUploadModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
            </div>
            
            <div className="p-6">
              {/* プロジェクト名入力 */}
              <div className="mb-4">
                <label className="text-xs font-bold text-slate-400 block mb-1">PROJECT NAME (OPTIONAL)</label>
                <input 
                  type="text" 
                  className="w-full p-2 border rounded text-sm focus:ring-2 focus:ring-blue-200 outline-none" 
                  placeholder="e.g. 定例会議 12/18"
                  value={projectName}
                  onChange={e => setProjectName(e.target.value)}
                />
              </div>

              {/* タブ切り替え */}
              <div className="flex border rounded-lg p-1 bg-slate-100 mb-4">
                <button 
                  onClick={() => setUploadTab('FILE')}
                  className={`flex-1 py-1 text-xs font-bold rounded ${uploadTab === 'FILE' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}
                >
                  📁 File Upload
                </button>
                <button 
                  onClick={() => setUploadTab('TEXT')}
                  className={`flex-1 py-1 text-xs font-bold rounded ${uploadTab === 'TEXT' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}
                >
                  📝 Direct Text
                </button>
              </div>

              {/* コンテンツエリア */}
              {uploadTab === 'FILE' ? (
                <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center bg-slate-50 hover:bg-blue-50 transition-colors">
                  <input 
                    type="file" 
                    id="fileInput" 
                    className="hidden" 
                    accept="audio/*,video/*,text/*"
                    onChange={(e) => {
                      if(e.target.files?.[0]) {
                        setFile(e.target.files[0]);
                        e.target.value = ''; // リセット
                      }
                    }}
                  />
                  <label htmlFor="fileInput" className="cursor-pointer flex flex-col items-center">
                     <Upload className="text-blue-500 mb-2" size={32} />
                     <span className="text-sm font-bold text-slate-600">{file ? file.name : 'Click to select file'}</span>
                     <span className="text-xs text-slate-400 mt-1">Audio, Video, Text supported</span>
                  </label>
                </div>
              ) : (
                <div>
                  <textarea 
                    className="w-full border rounded-xl p-3 text-sm h-32 focus:ring-2 focus:ring-blue-200 outline-none"
                    placeholder="ここに議事録やメモを直接貼り付けてください..."
                    value={textInput}
                    onChange={e => setTextInput(e.target.value)}
                  />
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t flex justify-end">
              <button 
                onClick={handleCreateJob}
                disabled={isUploading}
                className="bg-blue-600 text-white px-6 py-2 rounded-full font-bold shadow hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {isUploading ? <span className="animate-spin">⏳</span> : <Plus size={16}/>}
                {isUploading ? 'Processing...' : 'Create Intelligence'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}