"use client";
import { useState, useRef } from "react";

interface FileUploaderProps { onUploadComplete?: () => void; }

export default function FileUploader({ onUploadComplete }: FileUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) setFile(e.target.files[0]);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setProgress(10);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const xhr = new XMLHttpRequest();
      // ★修正: http://localhost:8080/upload -> /api/upload
      xhr.open("POST", "/api/upload", true);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status === 200) {
          alert("✅ アップロード完了！");
          setFile(null);
          if (fileInputRef.current) fileInputRef.current.value = "";
          setProgress(0);
          if (onUploadComplete) onUploadComplete();
        } else {
          alert("❌ 失敗: " + xhr.statusText);
        }
        setUploading(false);
      };
      xhr.onerror = () => {
        alert("❌ 通信エラー");
        setUploading(false);
      };
      xhr.send(formData);
    } catch (error) {
      console.error(error);
      setUploading(false);
    }
  };

  return (
    <div className="bg-slate-800 p-6 rounded-lg border border-slate-700 shadow-xl max-w-2xl mx-auto">
      <div className="w-full mb-4">
        <label htmlFor="file-upload" className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer ${file ? "border-blue-500 bg-blue-900/20" : "border-slate-600 hover:bg-slate-700/50"}`}>
          <div className="flex flex-col items-center justify-center pt-5 pb-6">
            {file ? <p className="text-sm font-bold text-slate-200">{file.name}</p> : <p className="text-sm text-slate-400">Click to upload</p>}
          </div>
          <input id="file-upload" type="file" accept="audio/*" className="hidden" onChange={handleFileChange} ref={fileInputRef} />
        </label>
      </div>
      {file && !uploading && (
        <button onClick={handleUpload} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-4 rounded-lg">🚀 分析開始</button>
      )}
      {uploading && (
        <div className="w-full bg-slate-700 rounded-full h-4 overflow-hidden"><div className="bg-blue-500 h-4 rounded-full text-[10px] text-center text-white" style={{ width: `${progress}%` }}>{progress}%</div></div>
      )}
    </div>
  );
}