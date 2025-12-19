'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';

export default function UploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [securityMode, setSecurityMode] = useState('NORMAL');
  const fileInputRef = useRef<HTMLInputElement>(null);

const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // ファイルが存在する場合のみ処理
    if (e.target.files && e.target.files[0]) {
      // 1. ReactのStateにファイルを保存（これでアプリ側はファイルを保持できる）
      setFile(e.target.files[0]);
    }
    
    // 2. 【追加】HTMLのinputタグ自体はクリアする
    // これにより、ブラウザは「ファイル未選択状態」に戻るため、
    // 次に同じファイルを選んでも「新しい選択（変更）」として検知してくれます。
    e.target.value = ''; 
  };

  const handleUpload = async () => {
    if (!file) return;
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('securityMode', securityMode);
      // ★入力項目は削除しました

      // ★MacのIPアドレス (確認済み: 192.168.0.248)
      const API_URL = 'http://192.168.0.248:3001/api/jobs'; 

      const res = await fetch(API_URL, {
        method: 'POST',
        body: formData,
        mode: 'cors',
      });

      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      router.push(`/jobs/${data.job.id}`);

    } catch (error) {
      alert(`Upload Error: ${error}`);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f5f5f7] text-slate-800 font-sans p-6 flex flex-col items-center justify-center">
      <div className="w-full max-w-2xl bg-white rounded-3xl p-10 shadow-xl border border-slate-200">
        
        <div className="flex items-center justify-between mb-8">
           <Link href="/" className="text-slate-400 hover:text-blue-600 transition">← Back</Link>
           <Image src="/logo.png" alt="Logo" width={100} height={30} className="opacity-80" />
        </div>

        <h1 className="text-2xl font-bold text-slate-800 mb-2 text-center">New Intelligence</h1>
        <p className="text-slate-500 text-center mb-8 text-sm">音声ファイルをアップロードして分析を開始</p>
          
        <div className="flex justify-center gap-2 mb-8">
            {[{ id: 'NORMAL', label: '🟢 Normal', desc: '社外秘なし' }, { id: 'STEALTH', label: '🟡 Stealth', desc: '閲覧制限' }, { id: 'ANONYMOUS', label: '🔴 Anonymous', desc: '完全匿名化' }].map((mode) => (
              <button key={mode.id} onClick={() => setSecurityMode(mode.id)} className={`px-4 py-2 rounded-lg text-xs font-bold border transition-all flex flex-col items-center gap-1 w-28 ${securityMode === mode.id ? 'bg-slate-800 text-white border-slate-800 shadow-lg scale-105' : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'}`}><span>{mode.label}</span><span className="text-[9px] font-normal opacity-70">{mode.desc}</span></button>
            ))}
        </div>

        <div onClick={() => fileInputRef.current?.click()} className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all mb-8 ${file ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'}`}>
          <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="audio/*,text/*,.mp3,.wav,.m4a,.txt" />
          {file ? (
            <div>
              <div className="text-3xl mb-2">📄</div>
              <div className="font-bold text-slate-700">{file.name}</div>
              <div className="text-slate-400 text-xs mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</div>
            </div>
          ) : (
            <div>
              <div className="text-3xl mb-2 text-slate-300">☁️</div>
              <div className="font-bold text-slate-500">Tap to Upload File</div>
            </div>
          )}
        </div>

        <button onClick={handleUpload} disabled={!file || isUploading} className={`w-full py-4 rounded-xl font-bold text-white shadow-lg transition-all ${!file || isUploading ? 'bg-slate-300' : 'bg-blue-600 hover:bg-blue-700'}`}>
          {isUploading ? 'Uploading...' : 'Start Analysis'}
        </button>
      </div>
    </main>
  );
}