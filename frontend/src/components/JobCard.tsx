// frontend/src/components/JobCard.tsx
import React from 'react';
import Link from 'next/link';
import { FileAudio, FileText, CheckCircle, Clock, AlertCircle } from 'lucide-react';

interface Job {
  id: string;
  status: string;
  createdAt: string;
  summary?: string;
}

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleString('ja-JP', { 
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
  });
};

const StatusBadge = ({ status }: { status: string }) => {
  switch (status) {
    case 'completed':
      return <span className="flex items-center text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-full"><CheckCircle className="w-3 h-3 mr-1" />完了</span>;
    case 'processing':
      return <span className="flex items-center text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-full"><Clock className="w-3 h-3 mr-1 animate-pulse" />解析中</span>;
    default:
      return <span className="flex items-center text-xs font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded-full"><AlertCircle className="w-3 h-3 mr-1" />待機</span>;
  }
};

export const JobCard = ({ job }: { job: Job }) => {
  // サマリーがない場合はプレースホルダー
  const previewText = job.summary 
    ? job.summary.slice(0, 80) + (job.summary.length > 80 ? "..." : "")
    : "音声/テキストデータの解析待ち、または詳細なし";

  return (
    <Link href={`/jobs/${job.id}`} className="block">
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 active:scale-[0.98] transition-transform duration-100 mb-3">
        <div className="flex justify-between items-start mb-2">
          <div className="flex items-center space-x-2">
            {/* 音声かテキストかでアイコンを変えるロジックを入れる余地あり。一旦Audio固定 */}
            <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
              <FileAudio size={20} />
            </div>
            <div>
              <p className="text-xs text-gray-400 font-mono">{formatDate(job.createdAt)}</p>
              <h3 className="text-sm font-bold text-gray-800">Mission Log #{job.id.slice(0, 4)}</h3>
            </div>
          </div>
          <StatusBadge status={job.status} />
        </div>
        
        <div className="pl-11">
          <p className="text-sm text-gray-600 leading-relaxed line-clamp-2">
            {previewText}
          </p>
        </div>
      </div>
    </Link>
  );
};