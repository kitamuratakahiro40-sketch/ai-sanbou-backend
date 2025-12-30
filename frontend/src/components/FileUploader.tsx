"use client";

import React, { useState, useRef, ChangeEvent } from "react";

// 🌟 環境変数、または直接指定
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api-service-649523701953.asia-northeast1.run.app';

interface FileUploaderProps {
  onUploadComplete?: () => void;
}

export default function FileUploader({ onUploadComplete }: FileUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setProgress(5); 

    try {
      // 1. 署名付きURLを取得
      const urlRes = await fetch(`${API_BASE_URL}/api/upload/signed-url`, { // ★エンドポイント確認: jobs.tsではなくupload.tsを見るならここ
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, fileType: file.type }),
        mode: 'cors',
      });
      
      if (!urlRes.ok) {
        const errData = await urlRes.json().catch(() => ({}));
        throw new Error(errData.detail || "署名付きURLの取得に失敗しました");
      }

      // ★【修正ポイント】 変数名をAPIのレスポンスに合わせる
      // APIは { uploadUrl, fileName } を返しています
      const { uploadUrl, fileName } = await urlRes.json();
      
      setProgress(15);

      // 2. GCSへ直接アップロード
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", uploadUrl, true); // ★修正: url -> uploadUrl
      xhr.setRequestHeader("Content-Type", file.type);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentComplete = (event.loaded / event.total) * 100;
          setProgress(Math.round(15 + (percentComplete * 0.75)));
        }
      };

      xhr.onload = async () => {
        if (xhr.status === 200) {
          setProgress(95);
          
          // 3. APIへ分析依頼 (ここで400エラーが出ていた)
          console.log(`📡 [Direct Connect] POST to: ${API_BASE_URL}/api/jobs`);
          
          const jobRes = await fetch(`${API_BASE_URL}/api/jobs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              gcsPath: fileName,            // ★修正: gcsFileName -> fileName
              userId: 'cmjfb9m620000clqy27f31wo4', 
              projectName: file.name
            }),
            mode: 'cors',
          });

          if (jobRes.ok) {
            alert("✅ アップロード完了！分析を開始します。");
            setFile(null);
            if (fileInputRef.current) fileInputRef.current.value = "";
            setProgress(0);
            if (onUploadComplete) onUploadComplete();
          } else {
            const errData = await jobRes.json().catch(() => ({}));
            console.error("Job Creation Error:", errData);
            alert(`❌ 分析依頼に失敗しました: status ${jobRes.status}`);
          }
        } else {
          alert(`❌ GCSアップロード失敗: ${xhr.status}`);
        }
        setUploading(false);
      };

      xhr.onerror = () => {
        alert("❌ 通信エラー。GCSのCORS設定を確認してください。");
        setUploading(false);
      };

      xhr.send(file);

    } catch (error: any) {
      console.error(error);
      setUploading(false);
      alert(`予期せぬエラーが発生しました: ${error.message}`);
    }
  };

  // ... (表示部分は変更なし)
  return (
    <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-xl max-w-2xl mx-auto">
      <div className="flex flex-col items-center gap-4">
        <div className="w-full">
          <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-200 ${file ? "border-blue-500 bg-blue-900/20" : "border-slate-600 hover:bg-slate-700/50"}`}>
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              {file ? (
                <>
                  <p className="text-3xl mb-2">📄</p>
                  <p className="text-sm text-slate-200 font-bold">{file.name}</p>
                </>
              ) : (
                <>
                  <p className="text-3xl mb-2 text-slate-400">☁️</p>
                  <p className="text-sm text-slate-400">Click to upload (MP3, M4A)</p>
                </>
              )}
            </div>
            <input type="file" accept="audio/*,video/*" className="hidden" onChange={handleFileChange} ref={fileInputRef} />
          </label>
        </div>
        {file && (
          <div className="w-full">
            {uploading ? (
              <div className="w-full bg-slate-700 rounded-full h-5 overflow-hidden relative">
                <div className="bg-blue-500 h-5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
              </div>
            ) : (
              <button onClick={handleUpload} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-4 rounded-lg">🚀 分析開始</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}