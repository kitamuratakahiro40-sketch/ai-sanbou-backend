'use client'

import { useState } from 'react';
// NextAuthのセッション（トークン）を使うためにインポート
import { useSession } from 'next-auth/react';

export default function UploadForm() {
  const { data: session } = useSession(); // ログイン情報を取得
  const [isUploading, setIsUploading] = useState(false);

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    // ログインしていなければ中断（または警告）
    if (!session) {
      alert("ログインしてください");
      return;
    }

    const formData = new FormData(e.currentTarget);
    // フォームの入力名(audio)を、バックエンドが待っている名前(file)に入れ替える
    const audioFile = formData.get('audio') as File;
    if (!audioFile) return;

    // 送信用のデータを作り直す
    const submitData = new FormData();
    submitData.append('file', audioFile); // ★ここが重要！ "audio" ではなく "file" で送る

    setIsUploading(true);

    try {
      console.log("🚀 Uploading to Express API...");

      // APIへのリクエスト (Next.jsのプロキシを経由してExpressへ)
      const res = await fetch('/api/jobs/upload', {
        method: 'POST',
        headers: {
          // ★ここで「入館証（トークン）」を見せる
          // ※ sessionに何のトークンが入っているかは設定によりますが、一旦アクセストークンなどを送る想定です
          'Authorization': `Bearer ${session?.user?.id || 'dummy-token'}`, 
        },
        body: submitData, // "file"が入ったデータを送る
      });

      if (!res.ok) {
        // エラーレスポンス（401や500）の内容を読み取る
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Upload failed: ${res.statusText}`);
      }

      const data = await res.json();
      console.log("✅ Upload success:", data);
      alert('✅ アップロード完了！');
      
      // 成功したら画面をリロードして一覧を更新
      window.location.reload();

    } catch (error) {
      console.error("❌ Error:", error);
      alert(`エラーが発生しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <form onSubmit={handleUpload} className="space-y-4 p-4 border rounded-lg bg-gray-50">
      <input 
        type="file" 
        name="audio" // UI上はaudioのままでOK（内部でfileに詰め替えています）
        accept="audio/*" 
        required 
        className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
      />
      <button 
        type="submit" 
        disabled={isUploading}
        className="w-full bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isUploading ? '📤 APIへアップロード中...' : 'アップロード開始'}
      </button>
    </form>
  );
}