"use client";

import { useState, useRef } from "react";

interface FileUploaderProps {
  onUploadComplete?: () => void;
}

export default function FileUploader({ onUploadComplete }: FileUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setProgress(10); 

    try {
      const formData = new FormData();
      formData.append("file", file);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/upload", true);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentComplete = (event.loaded / event.total) * 100;
          setProgress(Math.round(percentComplete));
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200 || xhr.status === 201) {
          alert("✅ アップロード完了！AI分析を開始します。");
          setFile(null);
          if (fileInputRef.current) fileInputRef.current.value = "";
          setProgress(0);
          if (onUploadComplete) onUploadComplete();
        } else {
          alert(`❌ アップロード失敗: ${xhr.status}`);
        }
        setUploading(false);
      };

      xhr.onerror = () => {
        alert("❌ 通信エラー。Backendを確認してください。");
        setUploading(false);
      };

      xhr.send(formData);

    } catch (error) {
      console.error(error);
      setUploading(false);
      alert("予期せぬエラーが発生しました");
    }
  };

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