"use client";

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  Trash2, Save, Edit3, FileText, Search, CheckSquare, 
  Square, RefreshCw, Globe, Download, MonitorPlay, ArrowLeft, Printer 
} from 'lucide-react';
import GammaButton from '@/components/GammaButton';

// 🌟 クラウドAPIへの直通ルート
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://api-service-649523701953.asia-northeast1.run.app/api/jobs';

// --- 型定義 ---
type Segment = {
  speaker: string;
  text: string;
  id: number;
};

type Metrics = {
  transparency: number;
  passion: number;
  risk: number;
};

export default function JobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  // --- State ---
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // ★変更: タブの並び順変更に合わせてデフォルトをTRANSCRIPT（文字起こし）に変更
  const [activeTab, setActiveTab] = useState<'TRANSCRIPT' | 'BUSINESS' | 'PPT' | 'NARRATIVE'>('TRANSCRIPT');
  
  const [isRequesting, setIsRequesting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // タイ語要約モード管理
  const [isThaiMode, setIsThaiMode] = useState(false);

  // ★翻訳表示モード管理
  const [showTranslation, setShowTranslation] = useState(true);

  // フォーム状態
  const [editForm, setEditForm] = useState({ clientName: '', projectName: '', tags: '', transcript: '' });

  // Speaker Mapping
  const [speakerMap, setSpeakerMap] = useState<Record<string, string>>({
    'Speaker A': '', 'Speaker B': '', 'Speaker C': '', 'Speaker D': '', 'Speaker E': ''
  });

  // 検索・選択・翻訳用
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [targetLang, setTargetLang] = useState<'JA' | 'EN' | 'TH'>('JA');
  const [pptOutput, setPptOutput] = useState('');

  // --- Functions ---

  const parseTranscriptToSegments = (text: string): Segment[] => {
    if (!text) return [];
    const parts = text.split(/(\[Speaker [A-Z]\]|Speaker [A-Z]:)/g);
    const newSegments: Segment[] = [];
    let currentSpeaker = 'Unknown';
    let idCounter = 0;

    parts.forEach(part => {
      if (part.match(/(\[Speaker [A-Z]\]|Speaker [A-Z]:)/)) {
        currentSpeaker = part.replace(/[\[\]:]/g, '').trim();
      } else if (part.trim()) {
        newSegments.push({ id: idCounter++, speaker: currentSpeaker, text: part.trim() });
      }
    });
    return newSegments;
  };

  const fetchJob = async () => {
    try {
      if (!id) return;
      const res = await fetch(`${API_BASE}/${id}`, { mode: 'cors' });
      
      if (!res.ok) throw new Error('Load failed');
      const data = await res.json();
      
      const jobData = data.job || data;
      setJob(jobData);

      if (jobData.transcript && segments.length === 0) {
        setSegments(parseTranscriptToSegments(jobData.transcript));
      }

      if (!isEditing) {
        setEditForm({
          clientName: jobData.clientName || '',
          projectName: jobData.projectName || '',
          tags: jobData.tags || '',
          transcript: jobData.transcript || ''
        });
        if (jobData.pptOutput) setPptOutput(jobData.pptOutput);
        if (jobData.speakerMap && typeof jobData.speakerMap === 'object') {
             setSpeakerMap(jobData.speakerMap);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJob();
    const interval = setInterval(fetchJob, 5000);
    return () => clearInterval(interval);
  }, [id, isEditing]);


  // --- Action Handlers ---

  const handleSaveMeta = async () => {
    try {
      await fetch(`${API_BASE}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...editForm, speakerMap }),
        mode: 'cors'
      });
      setIsEditing(false);
      setSegments(parseTranscriptToSegments(editForm.transcript));
      fetchJob();
      alert('変更を保存しました');
    } catch (e) {
      alert('保存に失敗しました');
    }
  };

  const handleDelete = async () => {
    if (!confirm('本当に削除しますか？ (取り消せません)')) return;
    try {
      const res = await fetch(`${API_BASE}/${id}`, { method: 'DELETE', mode: 'cors' });
      if (res.ok) {
        alert('削除しました');
        router.push('/');
      } else {
        alert('削除に失敗しました');
      }
    } catch (e) {
      alert('削除エラーが発生しました');
    }
  };

  const handleAnalyze = async (type: string, extraData?: any) => {
    if (!job || isRequesting) return;
    setIsRequesting(true);
    try {
      const payload: any = { type, isThaiMode, ...extraData };
      
      if (type === 'PARTIAL_SUMMARY') {
        payload.textContext = segments
          .filter(s => selectedIndices.includes(s.id))
          .map(s => `${speakerMap[s.speaker] || s.speaker}: ${s.text}`)
          .join('\n');
      }
      
      // 既存の翻訳ロジック (Narrative/Business用)
      if (type === 'TRANSLATE') {
        payload.targetLang = targetLang;
        payload.sourceKey = activeTab === 'NARRATIVE' ? 'NARRATIVE' : 'BUSINESS';
        payload.sourceText = activeTab === 'NARRATIVE' ? job.narrative : job.shieldOutput;
      }

      await fetch(`${API_BASE}/${id}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        mode: 'cors'
      });

      alert('処理を開始しました！完了までお待ち下さい。');
      fetchJob();
    } catch (error) {
      alert('エラーが発生しました');
    } finally {
      setIsRequesting(false);
    }
  };

  // ★追加: PPT専用の翻訳ハンドラー
  const handlePptTranslate = async (lang: 'Japanese' | 'English' | 'Thai') => {
    if (!job || isRequesting) return;
    setIsRequesting(true);
    try {
      await fetch(`${API_BASE}/${id}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'TRANSLATE', // Worker側でTRANSLATEアクションとして処理される
          targetLang: lang,
          sourceKey: 'PPT_DRAFT', // ★PPT下書きをソースにする合図
          sourceText: job.pptOutput // 現在の下書きを送る（念のため）
        }),
        mode: 'cors'
      });
      alert(`スライド言語を切り替えています... (${lang})`);
      
      // 少し待ってからリロード
      setTimeout(() => {
        fetchJob();
      }, 2000);
      
    } catch (error) {
      alert('翻訳リクエストに失敗しました');
    } finally {
      setIsRequesting(false);
    }
  };


  const toggleSelection = (idx: number) => {
    setSelectedIndices(prev => prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]);
  };

  const handlePrint = () => {
    window.print();
  };

  const getTranslation = (tab: 'NARRATIVE' | 'BUSINESS') => {
    if (!job?.translations || typeof job.translations !== 'object') return null;
    const key = `${targetLang}_${tab}`; 
    return job.translations[key] as string;
  };

  // --- Render Components ---

  const MetricsBar = ({ label, value, color }: { label: string, value: number, color: string }) => (
    <div className="mb-4">
      <div className="flex justify-between text-xs font-bold text-slate-500 mb-1">
        <span>{label}</span><span>{value}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2.5">
        <div className={`h-2.5 rounded-full ${color}`} style={{ width: `${value}%` }}></div>
      </div>
    </div>
  );

  const TranslateControl = () => (
    <div className="flex justify-end gap-2 mb-4 print:hidden items-center bg-slate-50 p-2 rounded-lg border border-slate-100">
      <span className="text-xs font-bold text-slate-400">翻訳:</span>
      <select 
        className="text-xs border rounded p-1 text-slate-700 outline-none" 
        value={targetLang} 
        onChange={(e: any) => setTargetLang(e.target.value)}
      >
        <option value="JA">日本語</option>
        <option value="EN">English</option>
        <option value="TH">Thai</option>
      </select>
      <button 
        onClick={() => handleAnalyze('TRANSLATE')} 
        disabled={isRequesting}
        className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded flex items-center gap-1 shadow-sm transition"
      >
        <Globe size={14}/> {isRequesting ? '翻訳中...' : '実行'}
      </button>
    </div>
  );

  const ThaiModeToggle = () => (
    <div className="flex items-center gap-2 mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg w-fit animate-in fade-in print:hidden">
      <input
        type="checkbox"
        id="thai-mode"
        checked={isThaiMode}
        onChange={(e) => setIsThaiMode(e.target.checked)}
        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
      />
      <label htmlFor="thai-mode" className="text-sm font-bold text-slate-700 cursor-pointer select-none flex items-center gap-2">
        🇹🇭 Thai Summary Mode <span className="text-xs font-normal text-slate-500">(For MD/Staff)</span>
      </label>
    </div>
  );

  if (loading) return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">Loading...</div>;
  if (!job) return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-red-400">Job not found</div>;

  const metrics: Metrics = job.metrics || { transparency: 50, passion: 50, risk: 0 };
  const filteredSegments = segments.filter(s => searchQuery === '' || s.text.includes(searchQuery));

  return (
    <main className="min-h-screen bg-[#f5f5f7] text-slate-800 font-sans pb-20 print:bg-white print:pb-0">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 p-4 sticky top-0 z-20 shadow-sm print:hidden">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-slate-400 hover:text-blue-600 transition">
              <ArrowLeft size={20} />
            </Link>
            <h1 className="font-bold text-lg text-slate-700 truncate max-w-md">
              {job.projectName || 'Untitled Project'}
            </h1>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={handlePrint} 
              className="flex items-center gap-1 text-xs font-bold text-slate-600 hover:bg-slate-100 px-3 py-2 rounded transition"
            >
              <Printer size={14} /> 印刷
            </button>

            {!isEditing && (
              <button onClick={handleDelete} className="flex items-center gap-1 text-xs text-red-500 hover:bg-red-50 px-3 py-2 rounded">
                <Trash2 size={14} /> 削除
              </button>
            )}
            <button 
              onClick={() => isEditing ? handleSaveMeta() : setIsEditing(true)} 
              className={`flex items-center gap-1 text-xs font-bold px-4 py-2 rounded text-white transition ${isEditing ? 'bg-green-600 hover:bg-green-700' : 'bg-slate-800 hover:bg-slate-700'}`}
            >
              {isEditing ? <><Save size={14}/> 保存</> : <><Edit3 size={14}/> 編集</>}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-6 print:p-0 print:max-w-none">
        
        {/* Editing Mode */}
        {isEditing && (
          <div className="mb-8 space-y-4 bg-white p-6 rounded-xl border border-blue-100 shadow-sm animate-in fade-in print:hidden">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-400 block mb-1">PROJECT NAME</label>
                <input 
                  type="text" 
                  className="w-full p-2 border rounded text-sm"
                  value={editForm.projectName} 
                  onChange={e => setEditForm({...editForm, projectName: e.target.value})} 
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400 block mb-1">CLIENT NAME</label>
                <input 
                  type="text" 
                  className="w-full p-2 border rounded text-sm"
                  value={editForm.clientName} 
                  onChange={e => setEditForm({...editForm, clientName: e.target.value})} 
                />
              </div>
            </div>
            
            <div>
              <label className="text-xs font-bold text-slate-400 block mb-2">SPEAKER MAPPING</label>
              <div className="flex flex-wrap gap-2 bg-slate-50 p-3 rounded border">
                {['Speaker A', 'Speaker B', 'Speaker C', 'Speaker D', 'Speaker E'].map((key) => (
                  <div key={key} className="flex items-center gap-2 bg-white px-2 py-1 rounded border shadow-sm">
                    <span className="text-[10px] text-blue-500 font-bold w-16">{key}</span>
                    <span className="text-slate-300">→</span>
                    <input 
                      type="text" 
                      className="w-24 p-1 text-xs border-b focus:outline-none focus:border-blue-500" 
                      placeholder="名前を入力"
                      value={speakerMap[key] || ''}
                      onChange={(e) => setSpeakerMap({...speakerMap, [key]: e.target.value})}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-400 block mb-1">RAW TRANSCRIPT</label>
              <textarea 
                className="w-full p-2 border rounded text-sm font-mono h-32"
                value={editForm.transcript}
                onChange={e => setEditForm({...editForm, transcript: e.target.value})}
              />
            </div>
          </div>
        )}

        {/* ★変更: Tab Navigation（並び順変更） */}
        <div className="flex border-b border-slate-200 mb-6 sticky top-[73px] bg-[#f5f5f7] z-10 pt-2 print:hidden">
          {[
            { id: 'TRANSCRIPT', label: '1. 文字起こし(検索)', icon: Search },
            { id: 'BUSINESS', label: '2. 議事録・分析', icon: CheckSquare },
            { id: 'PPT', label: '3. PPT下書き', icon: MonitorPlay },
            { id: 'NARRATIVE', label: '4. ナラティブ要約', icon: FileText },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              className={`flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 border-b-2 transition ${
                activeTab === t.id 
                  ? 'border-blue-600 text-blue-600 bg-white rounded-t-lg' 
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              <t.icon size={16} /> <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="min-h-[500px]">
          
          {/* === 1. TRANSCRIPT TAB === */}
          {activeTab === 'TRANSCRIPT' && (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 print:border-none print:shadow-none animate-in fade-in">
              <div className="flex gap-2 mb-4 sticky top-0 bg-white pb-2 pt-2 z-0 print:hidden">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
                  <input 
                    type="text" 
                    placeholder="発言を検索..." 
                    className="w-full pl-10 pr-4 py-2 border rounded-full bg-slate-50 focus:bg-white transition"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              {selectedIndices.length > 0 && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex justify-between items-center print:hidden">
                  <span className="text-xs font-bold text-blue-600">{selectedIndices.length}件の発言を選択中</span>
                  <button 
                    onClick={() => handleAnalyze('PARTIAL_SUMMARY')}
                    disabled={isRequesting}
                    className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded shadow hover:bg-blue-500 transition flex items-center gap-1"
                  >
                    {isRequesting ? <RefreshCw className="animate-spin" size={12}/> : <FileText size={12}/>} 
                    選択範囲を要約
                  </button>
                </div>
              )}

              <div className="space-y-4">
                {filteredSegments.length > 0 ? filteredSegments.map((seg) => {
                  const speakerName = speakerMap[seg.speaker] || seg.speaker;
                  const isSelected = selectedIndices.includes(seg.id);
                  return (
                    <div 
                      key={seg.id} 
                      className={`flex gap-3 p-3 rounded hover:bg-slate-50 transition border-l-4 ${isSelected ? 'border-blue-500 bg-blue-50/30' : 'border-transparent'} print:border-l-0 print:pl-0`}
                    >
                      <button onClick={() => toggleSelection(seg.id)} className="pt-1 text-slate-300 hover:text-blue-500 print:hidden">
                        {isSelected ? <CheckSquare size={18} className="text-blue-500"/> : <Square size={18}/>}
                      </button>
                      <div>
                        <div className="text-xs font-bold text-slate-500 mb-1">{speakerName}</div>
                        <div className="text-sm text-slate-700 leading-relaxed">{seg.text}</div>
                      </div>
                    </div>
                  );
                }) : (
                  <div className="text-center py-10 text-slate-400">No matches found.</div>
                )}
              </div>
            </div>
          )}

          {/* === 2. BUSINESS TAB === */}
          {activeTab === 'BUSINESS' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in">
              {/* 左カラム：分析スコア */}
              <div className="space-y-6 print:hidden">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                  <h3 className="text-sm font-bold text-slate-700 mb-4 border-b pb-2">📊 Sentiment Analysis</h3>
                  <MetricsBar label="Transparency (透明性)" value={metrics.transparency} color="bg-blue-500" />
                  <MetricsBar label="Passion (熱意)" value={metrics.passion} color="bg-red-500" />
                  <MetricsBar label="Risk Level (リスク)" value={metrics.risk} color="bg-amber-500" />
                </div>
                {job.tags && (
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <h3 className="text-sm font-bold text-slate-700 mb-2">🏷️ Tags</h3>
                    <div className="flex flex-wrap gap-2">
                      {job.tags.split(',').map((t:string, i:number) => (
                        <span key={i} className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded">{t.trim()}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 右カラム：議事録本文 */}
              <div className="lg:col-span-2 space-y-6 print:col-span-3">
                <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 min-h-[400px] print:shadow-none print:border-none print:p-0">
                   
                   <div className="flex justify-between items-start mb-4 print:hidden">
                     <ThaiModeToggle />
                     {job.shieldOutput && (
                        <button 
                           onClick={() => handleAnalyze('BUSINESS')} 
                           disabled={isRequesting}
                           className="text-xs bg-slate-100 text-slate-600 px-3 py-1.5 rounded hover:bg-slate-200 transition"
                         >
                           <RefreshCw size={12} className={`inline mr-1 ${isRequesting ? 'animate-spin' : ''}`}/> 
                           {isThaiMode ? 'タイ語で再生成' : '再生成'}
                         </button>
                     )}
                   </div>

                   {job.shieldOutput ? (
                     <>
                        {(() => {
                           const savedTranslation = getTranslation('BUSINESS');
                           
                           if (savedTranslation && showTranslation) {
                             return (
                               <div className="animate-in fade-in">
                                  <div className="bg-indigo-50 text-indigo-800 px-4 py-3 rounded-lg mb-6 text-sm font-bold flex justify-between items-center border border-indigo-100 print:hidden">
                                      <span className="flex items-center gap-2"><Globe size={16}/> 翻訳モード ({targetLang})</span>
                                      <button 
                                        onClick={() => setShowTranslation(false)} 
                                        className="text-xs underline hover:text-indigo-600"
                                      >
                                        原文に戻す
                                      </button>
                                  </div>
                                  <div className="prose prose-sm max-w-none whitespace-pre-wrap text-slate-700">
                                      {savedTranslation}
                                  </div>
                               </div>
                             );
                           } else {
                             return (
                               <div className="prose prose-sm max-w-none whitespace-pre-wrap text-slate-700">
                                  <div className="print:hidden">
                                    {!savedTranslation ? (
                                      <TranslateControl />
                                    ) : (
                                      <div className="mb-4 flex justify-end">
                                        <button 
                                          onClick={() => setShowTranslation(true)}
                                          className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded hover:bg-indigo-100 transition flex items-center gap-1"
                                        >
                                          <Globe size={14}/> {targetLang}翻訳を表示
                                        </button>
                                        <div className="scale-90 origin-right ml-2"><TranslateControl /></div>
                                      </div>
                                    )}
                                  </div>
                                  {job.shieldOutput}
                               </div>
                             );
                           }
                        })()}
                     </>
                   ) : (
                     <div className="text-center py-20">
                        <p className="text-slate-400 mb-4">ビジネス議事録はまだ作成されていません</p>
                        <button 
                          onClick={() => handleAnalyze('BUSINESS')} 
                          disabled={isRequesting}
                          className="bg-emerald-600 text-white px-6 py-2 rounded-full font-bold shadow hover:bg-emerald-700 transition flex items-center gap-2 mx-auto"
                        >
                          <CheckSquare size={18}/> {isThaiMode ? 'タイ語要約を作成 (TH Summary)' : 'ビジネス要約を作成'}
                        </button>
                     </div>
                   )}
                </div>
                
                {job.spearOutput && Array.isArray(job.spearOutput) && job.spearOutput.length > 0 && (
                  <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-red-500 print:shadow-none print:border">
                    <h3 className="text-red-600 font-bold mb-4 flex items-center gap-2"><CheckSquare size={18}/> Action Items</h3>
                    <ul className="space-y-3">
                      {job.spearOutput.map((item: any, idx: number) => (
                        <li key={idx} className="flex gap-3 text-sm text-slate-700">
                          <input type="checkbox" className="mt-1" />
                          <span>{typeof item === 'string' ? item : item.task || JSON.stringify(item)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* === 3. PPT TAB (新機能) === */}
          {activeTab === 'PPT' && (
            <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 min-h-[500px] animate-in fade-in">
              <div className="mb-6 flex justify-between items-center">
                <h3 className="font-bold text-lg text-slate-700">PowerPoint Draft (Markdown)</h3>
                <button 
                  onClick={() => handleAnalyze('PPT')} 
                  disabled={isRequesting}
                  className="bg-orange-600 text-white px-4 py-2 rounded text-sm hover:bg-orange-700 flex items-center gap-2"
                >
                  <MonitorPlay size={16} /> {pptOutput ? '再生成' : 'スライド構成案を作成'}
                </button>
              </div>
              
              {pptOutput ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* 左側: Markdownエディタ (2/3) */}
                  <div className="lg:col-span-2 relative group flex flex-col gap-2">
                    
                    {/* ★追加: 言語切り替えバー */}
                    <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg border border-gray-200 mb-2">
                      <span className="text-xs font-bold text-gray-500 mr-2">🌏 言語切替:</span>
                      
                      <button
                        onClick={() => handlePptTranslate('Japanese')}
                        disabled={isRequesting}
                        className="px-3 py-1.5 text-xs bg-white border border-gray-300 rounded hover:bg-gray-100 shadow-sm transition"
                      >
                        🇯🇵 日本語 (元に戻す)
                      </button>

                      <button
                        onClick={() => handlePptTranslate('Thai')}
                        disabled={isRequesting}
                        className="px-3 py-1.5 text-xs bg-white border border-blue-300 text-blue-700 rounded hover:bg-blue-50 shadow-sm font-bold transition"
                      >
                        🇹🇭 タイ語 (翻訳)
                      </button>

                      <button
                        onClick={() => handlePptTranslate('English')}
                        disabled={isRequesting}
                        className="px-3 py-1.5 text-xs bg-white border border-gray-300 rounded hover:bg-gray-100 shadow-sm transition"
                      >
                        🇺🇸 English
                      </button>
                      
                      {isRequesting && <span className="text-xs text-blue-500 animate-pulse ml-auto">処理中...</span>}
                    </div>

                    <div className="relative h-[500px]">
                        <textarea 
                        className="w-full h-full p-4 bg-slate-50 border rounded font-mono text-sm leading-relaxed focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none"
                        value={pptOutput}
                        readOnly
                        />
                        <button 
                        onClick={() => navigator.clipboard.writeText(pptOutput)}
                        className="absolute top-4 right-4 bg-white/80 hover:bg-white p-2 rounded shadow text-xs font-bold text-slate-600 opacity-0 group-hover:opacity-100 transition"
                        >
                        Copy Markdown
                        </button>
                    </div>
                  </div>

                  {/* 右側: Gamma操作パネル (1/3) */}
                  <div className="space-y-4">
                    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 p-5 rounded-xl border border-indigo-100">
                      <h4 className="font-bold text-indigo-900 mb-2 flex items-center gap-2">
                        🚀 Export to PowerPoint
                      </h4>
                      <p className="text-xs text-indigo-700/80 mb-4 leading-relaxed">
                        このMarkdown構成案を元に、Gamma AIを使ってデザイン済みのスライド(.pptx)を生成します。
                      </p>
                      
                      {/* Gamma生成ボタン */}
                      <GammaButton jobId={id} />
                      
                    </div>
                    {/* ★変更: 不要なTip文言を削除しました */}
                  </div>
                </div>
              ) : (
                <div className="text-center py-20 bg-slate-50 rounded-lg border border-dashed border-slate-300">
                  <p className="text-slate-400">ボタンを押してスライド構成案を生成してください</p>
                </div>
              )}
            </div>
          )}

          {/* === 4. NARRATIVE TAB === */}
          {activeTab === 'NARRATIVE' && (
            <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 print:shadow-none print:border-none print:p-0 animate-in fade-in">
              {job.narrative ? (
                <>
                  {(() => {
                     const savedTranslation = getTranslation('NARRATIVE');
                     
                     if (savedTranslation && showTranslation) {
                       return (
                         <div className="animate-in fade-in">
                             <div className="bg-indigo-50 text-indigo-800 px-4 py-3 rounded-lg mb-6 text-sm font-bold flex justify-between items-center border border-indigo-100 print:hidden">
                                 <span className="flex items-center gap-2"><Globe size={16}/> 翻訳モード ({targetLang})</span>
                                 <button 
                                   onClick={() => setShowTranslation(false)} 
                                   className="text-xs underline hover:text-indigo-600"
                                 >
                                   原文に戻す
                                 </button>
                             </div>
                             <div className="prose prose-slate max-w-none">
                                 <div className="whitespace-pre-wrap font-sans text-slate-700 leading-8 text-lg">
                                     {savedTranslation}
                                 </div>
                             </div>
                         </div>
                       );
                     } else {
                       return (
                         <div className="prose prose-slate max-w-none">
                            <div className="print:hidden">
                              {!savedTranslation ? (
                                <TranslateControl />
                              ) : (
                                <div className="mb-4 flex justify-end">
                                  <button 
                                    onClick={() => setShowTranslation(true)}
                                    className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded hover:bg-indigo-100 transition flex items-center gap-1"
                                  >
                                    <Globe size={14}/> {targetLang}翻訳を表示
                                  </button>
                                  <div className="scale-90 origin-right ml-2"><TranslateControl /></div>
                                </div>
                              )}
                            </div>

                           <div className="whitespace-pre-wrap font-sans text-slate-700 leading-8 text-lg">
                             {job.narrative}
                           </div>
                         </div>
                       );
                     }
                  })()}
                </>
              ) : (
                <div className="text-center py-20 text-slate-400">
                  <p className="mb-4">ナラティブ（物語）はまだ生成されていません</p>
                  <button 
                    onClick={() => handleAnalyze('NARRATIVE')} 
                    disabled={isRequesting}
                    className="bg-blue-600 text-white px-6 py-2 rounded-full font-bold hover:bg-blue-700 transition"
                  >
                    ナラティブ生成を開始
                  </button>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </main>
  );
}