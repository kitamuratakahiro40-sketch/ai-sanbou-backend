// frontend/src/components/MobileFloatingAction.tsx
"use client";

import React, { useState, useRef } from 'react';
import { Plus, Mic, FileText } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useSession, signIn } from 'next-auth/react';

export const MobileFloatingAction = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { data: session, status } = useSession(); // まとめて取得
  const isAuthenticated = status === 'authenticated';
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // ファイル選択時のハンドラ
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    // 認証チェック
    if (!isAuthenticated) {
      if (confirm("ログインが必要です。ログインページへ移動しますか？")) {
        signIn("google");
      }
      return;
    }

    if (!e.target.files?.[0]) return;
    
    setIsUploading(true);
    const file = e.target.files[0];

    console.log("🔥🔥🔥 新しいコードで動いています！送信名: file 🔥🔥🔥");
    
    const formData = new FormData();
    // ★★★ 最重要修正ポイント！ "audio" を "file" に変更 ★★★
    formData.append('file', file); 

    try {
      console.log("🚀 Uploading from MobileAction...");
      
      const res = await fetch('/api/jobs/upload', {
        method: 'POST',
        headers: {
            // 将来のためにトークンも渡しておく（バックエンドで認証OFFなら無視されるだけなので安全）
            'Authorization': `Bearer ${session?.user?.id || 'guest'}`,
        },
        body: formData,
      });

      if (res.ok) {
        alert('✅ 音声ファイルのアップロードが完了しました！');
        setIsOpen(false);
        // リストを更新するためにリロード
        window.location.reload();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`❌ アップロード失敗: ${err.error || res.statusText}`);
      }
    } catch (error) {
      console.error("Upload failed", error);
      alert('通信エラーが発生しました。');
    } finally {
      setIsUploading(false);
      // Inputをリセット（同じファイルを連続で選べるように）
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm transition-opacity"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Floating Menu (Expanded) */}
      <div className={`fixed bottom-24 right-6 z-50 flex flex-col items-end space-y-4 transition-all duration-200 ${isOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10 pointer-events-none'}`}>
        
        {/* Text Input Option */}
        <button 
          onClick={() => router.push('/new-text')}
          className="flex items-center space-x-3 group"
        >
          <span className="bg-white text-gray-700 px-3 py-1 rounded-md text-sm shadow-md font-medium">テキスト入力</span>
          <div className="p-3 bg-white text-indigo-600 rounded-full shadow-lg hover:bg-gray-50">
            <FileText size={24} />
          </div>
        </button>

        {/* Audio Upload Option */}
        <button 
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center space-x-3 group"
        >
          <span className="bg-white text-gray-700 px-3 py-1 rounded-md text-sm shadow-md font-medium">音声アップロード</span>
          <div className="p-3 bg-white text-pink-600 rounded-full shadow-lg hover:bg-gray-50">
            {isUploading ? (
              <div className="animate-spin h-6 w-6 border-2 border-pink-600 border-t-transparent rounded-full" />
            ) : (
              <Mic size={24} />
            )}
          </div>
        </button>
      </div>

      {/* Hidden Input for Native OS Picker */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="audio/*, .m4a, .mp3, .wav"
        onChange={handleFileChange}
      />

      {/* Main FAB */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-6 right-6 z-50 p-4 rounded-full shadow-xl text-white transition-all duration-300 ${isOpen ? 'bg-gray-600 rotate-45' : 'bg-indigo-600 hover:bg-indigo-700 hover:scale-105'}`}
      >
        <Plus size={28} />
      </button>
    </>
  );
};