"use client";

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  Trash2, Save, Edit3, FileText, Search, CheckSquare, 
  Square, RefreshCw, Globe, Download, MonitorPlay, ArrowLeft 
} from 'lucide-react';

// 🌟 1. クラウドAPIへの直通ルート（画像のローカルIPを修正済み）
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
  const [activeTab, setActiveTab] = useState<'TRANSCRIPT' | 'NARRATIVE' | 'BUSINESS' | 'PPT'>('NARRATIVE'); // デフォルトはナラティブ
  const [isRequesting, setIsRequesting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

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
    // [Speaker X] で分割するロジック
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
      console.log(`📡 Fetching Job: ${id}`);
      const res = await fetch(`${API_BASE}/${id}`, { mode: 'cors' }); // 直通便
      
      if (!res.ok) throw new Error('Load failed');
      const data = await res.json();
      
      // データ構造の正規化 (APIの返し方によって data.job か data そのままか調整)
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
        // 保存されたスピーカーマップがあれば復元（DBスキーマに依存）
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
    const interval = setInterval(fetchJob, 5000); // ポーリング
    return () => clearInterval(interval);
  }, [id, isEditing]);


  // --- Action Handlers ---

  const handleSaveMeta = async () => {
    try {
      await fetch(`${API_BASE}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...editForm, speakerMap }), // スピーカー設定も保存
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
      const payload: any = { type, ...extraData };
      
      // 部分要約
      if (type === 'PARTIAL_SUMMARY') {
        payload.textContext = segments
          .filter(s => selectedIndices.includes(s.id))
          .map(s => `${speakerMap[s.speaker] || s.speaker}: ${s.text}`)
          .join('\n');
      }
      
      // 翻訳
      if (type === 'TRANSLATE') {
        payload.targetLang = targetLang;
        // 現在のタブに応じて翻訳対象を変える
        payload.sourceText = activeTab === 'NARRATIVE' ? job.narrative : job.shieldOutput;
      }

      // PPT生成
      if (type === 'PPT') {
         // PPTは全文から生成
      }

      await fetch(`${API_BASE}/${id}/analyze`, { // action用エンドポイントが必要ならここを修正
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

  const toggleSelection = (idx: number) => {
    setSelectedIndices(prev => prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]);
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

  // 翻訳コントロールコンポーネント
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

  if (loading) return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">Loading...</div>;
  if (!job) return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-red-400">Job not found</div>;

  const metrics: Metrics = job.metrics || { transparency: 50, passion: 50, risk: 0 };
  const filteredSegments = segments.filter(s => searchQuery === '' || s.text.includes(searchQuery));

  return (
    <main className="min-h-screen bg-[#f5f5f7] text-slate-800 font-sans pb-20 print:bg-white">
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

      <div className="max-w-5xl mx-auto p-6">
        
        {/* Editing Mode */}
        {isEditing && (
          <div className="mb-8 space-y-4 bg-white p-6 rounded-xl border border-blue-100 shadow-sm animate-in fade-in">
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
            
            {/* Speaker Mapping Inputs */}
            <div>
              <label className="text-xs font-bold text-slate-400 block mb-2">SPEAKER MAPPING (AIの話者分離結果に名前を付ける)</label>
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

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 mb-6 sticky top-[73px] bg-[#f5f5f7] z-10 pt-2">
          {[
            { id: 'NARRATIVE', label: 'ナラティブ要約', icon: FileText },
            { id: 'BUSINESS', label: '議事録・分析', icon: CheckSquare },
            { id: 'TRANSCRIPT', label: '文字起こし(検索)', icon: Search },
            { id: 'PPT', label: 'PPT下書き', icon: MonitorPlay },
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
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <div className="flex gap-2 mb-4 sticky top-0 bg-white pb-2 pt-2 z-0">
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
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex justify-between items-center animate-in slide-in-from-top-2">
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
                  const speakerName = speakerMap[seg.speaker] || seg.speaker; // マッピング適用
                  const isSelected = selectedIndices.includes(seg.id);
                  return (
                    <div 
                      key={seg.id} 
                      className={`flex gap-3 p-3 rounded hover:bg-slate-50 transition border-l-4 ${isSelected ? 'border-blue-500 bg-blue-50/30' : 'border-transparent'}`}
                    >
                      <button onClick={() => toggleSelection(seg.id)} className="pt-1 text-slate-300 hover:text-blue-500">
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

          {/* === 2. NARRATIVE TAB === */}
          {activeTab === 'NARRATIVE' && (
            <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200">
              {job.narrative ? (
                <>
                  <TranslateControl />
                  
                  {/* ★翻訳結果があれば、それを優先表示するロジック */}
                  {job.translation ? (
                    <div className="animate-in fade-in">
                        <div className="bg-indigo-50 text-indigo-800 px-4 py-3 rounded-lg mb-6 text-sm font-bold flex justify-between items-center border border-indigo-100">
                            <span className="flex items-center gap-2"><Globe size={16}/> 翻訳モード ({targetLang})</span>
                            {/* 翻訳を消す（原文に戻す）ボタン */}
                            <button 
                              onClick={async () => {
                                // 画面上だけ消す（DBには残るが、今回は簡易的にnullセットで非表示化）
                                const newJob = { ...job, translation: null };
                                setJob(newJob);
                              }} 
                              className="text-xs underline hover:text-indigo-600"
                            >
                              原文に戻す
                            </button>
                        </div>
                        <div className="prose prose-slate max-w-none">
                            <div className="whitespace-pre-wrap font-sans text-slate-700 leading-8 text-lg">
                                {job.translation}
                            </div>
                        </div>
                    </div>
                  ) : (
                    // 翻訳がない場合（原文表示）
                    <div className="prose prose-slate max-w-none">
                      <div className="whitespace-pre-wrap font-sans text-slate-700 leading-8 text-lg">
                        {job.narrative}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                // ナラティブ自体がまだない場合
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

          {/* === 3. BUSINESS TAB === */}
          {activeTab === 'BUSINESS' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* 左カラム：分析スコア */}
              <div className="space-y-6">
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
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 min-h-[400px]">
                   {/* 議事録があれば表示 */}
                   {job.shieldOutput ? (
                     <>
                        {/* ★翻訳コントロール追加 */}
                        <TranslateControl />

                        {/* ★翻訳表示ロジック追加 */}
                        {job.translation ? (
                            <div className="animate-in fade-in">
                                <div className="bg-indigo-50 text-indigo-800 px-4 py-3 rounded-lg mb-6 text-sm font-bold flex justify-between items-center border border-indigo-100">
                                    <span className="flex items-center gap-2"><Globe size={16}/> 翻訳モード ({targetLang})</span>
                                    <button 
                                      onClick={() => setJob({ ...job, translation: null })} 
                                      className="text-xs underline hover:text-indigo-600"
                                    >
                                      原文に戻す
                                    </button>
                                </div>
                                <div className="prose prose-sm max-w-none whitespace-pre-wrap text-slate-700">
                                    {job.translation}
                                </div>
                            </div>
                        ) : (
                            // 原文表示
                            <div className="prose prose-sm max-w-none whitespace-pre-wrap text-slate-700">
                              {job.shieldOutput}
                            </div>
                        )}
                     </>
                   ) : (
                     <div className="text-center py-20">
                        <p className="text-slate-400 mb-4">ビジネス議事録はまだ作成されていません</p>
                        <button 
                          onClick={() => handleAnalyze('BUSINESS')} 
                          disabled={isRequesting}
                          className="bg-emerald-600 text-white px-6 py-2 rounded-full font-bold shadow hover:bg-emerald-700 transition flex items-center gap-2 mx-auto"
                        >
                          <CheckSquare size={18}/> ビジネス要約を作成
                        </button>
                     </div>
                   )}
                </div>
                
                {/* Spear Output (JSON Action Items) */}
                {job.spearOutput && Array.isArray(job.spearOutput) && job.spearOutput.length > 0 && (
                  <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-red-500">
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
          
          {/* === 4. PPT TAB === */}
          {activeTab === 'PPT' && (
            <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 min-h-[500px]">
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
                <div className="relative group">
                  <textarea 
                    className="w-full h-[500px] p-4 bg-slate-50 border rounded font-mono text-sm leading-relaxed focus:ring-2 focus:ring-blue-500 focus:outline-none"
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
              ) : (
                <div className="text-center py-20 bg-slate-50 rounded-lg border border-dashed border-slate-300">
                  <p className="text-slate-400">ボタンを押してスライド構成案を生成してください</p>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </main>
  );
}