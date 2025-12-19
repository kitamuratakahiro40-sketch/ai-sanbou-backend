'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  Trash2, Save, Edit3, FileText, Search, CheckSquare, 
  Square, RefreshCw, Globe, Download, MonitorPlay 
} from 'lucide-react';

const API_BASE = 'http://192.168.0.248:3001/api/jobs'; // 環境に合わせて変更

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
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'TRANSCRIPT' | 'NARRATIVE' | 'BUSINESS' | 'PPT'>('TRANSCRIPT');
  const [isRequesting, setIsRequesting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  
  // フォーム状態
  const [editForm, setEditForm] = useState({ clientName: '', projectName: '', tags: '', transcript: '' });
  
  // ★修正: Speaker D, E を追加
  const [speakerMap, setSpeakerMap] = useState<Record<string, string>>({
    'Speaker A': '', 'Speaker B': '', 'Speaker C': '', 'Speaker D': '', 'Speaker E': ''
  });

  // 検索・再要約・翻訳用
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [targetLang, setTargetLang] = useState<'JA' | 'EN' | 'TH'>('JA'); // ★翻訳言語管理
  const [pptOutput, setPptOutput] = useState<string>('');

  const fetchJob = async () => {
    try {
      if (!params?.id) return;
      const res = await fetch(`${API_BASE}/${params.id}`, { mode: 'cors' });
      if (!res.ok) throw new Error('Load failed');
      const data = await res.json();
      setJob(data.job);
      
      if (data.job.transcript && segments.length === 0) {
        parseTranscriptToSegments(data.job.transcript);
      }
      if (!isEditing) {
        setEditForm({
          clientName: data.job.clientName || '',
          projectName: data.job.projectName || '',
          tags: data.job.tags || '',
          transcript: data.job.transcript || ''
        });
        if (data.job.pptOutput) setPptOutput(data.job.pptOutput);
      }
    } catch (err) { console.error(err); } 
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchJob();
    const interval = setInterval(fetchJob, 5000);
    return () => clearInterval(interval);
  }, [params?.id, isEditing]);

  const parseTranscriptToSegments = (text: string) => {
    const parts = text.split(/(\[Speaker [A-Z]\]|Speaker [A-Z]:)/g);
    const newSegments: Segment[] = [];
    let currentSpeaker = 'Unknown';
    let idCounter = 0;
    parts.forEach((part) => {
      if (part.match(/(\[Speaker [A-Z]\]|Speaker [A-Z]:)/)) {
        currentSpeaker = part.replace(/[\[\]:]/g, '').trim();
      } else if (part.trim()) {
        newSegments.push({ id: idCounter++, speaker: currentSpeaker, text: part.trim() });
      }
    });
    setSegments(newSegments);
  };

  const handleSaveMeta = async () => {
    try {
      await fetch(`${API_BASE}/${job.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
        mode: 'cors'
      });
      setIsEditing(false);
      parseTranscriptToSegments(editForm.transcript);
      fetchJob();
      alert('変更を保存しました');
    } catch (e) { alert('保存に失敗しました'); }
  };

  // ★修正: 削除ロジックの強化
  const handleDelete = async () => {
    if (!confirm('本当に削除しますか？（取り消せません）')) return;
    try {
      const res = await fetch(`${API_BASE}/${job.id}`, { method: 'DELETE', mode: 'cors' });
      if (res.ok) {
        alert('削除しました');
        router.refresh(); // キャッシュクリア
        router.push('/'); // 一覧へ戻る
      } else {
        alert('削除に失敗しました');
      }
    } catch (e) { alert('削除エラーが発生しました'); }
  };

  const handleAnalyze = async (type: string, extraData?: any) => {
    if (!job || isRequesting) return;
    setIsRequesting(true);
    try {
      const payload = { type, ...extraData };
      if (type === 'PARTIAL_SUMMARY') {
        payload.textContext = segments.filter(s => selectedIndices.includes(s.id)).map(s => `${s.speaker}: ${s.text}`).join('\n');
      }
      // 翻訳リクエスト
      if (type === 'TRANSLATE') {
        payload.targetLang = targetLang;
        // 現在のタブに応じて翻訳対象を変える
        payload.sourceText = activeTab === 'NARRATIVE' ? job.narrative : job.shieldOutput;
      }

      await fetch(`${API_BASE}/${job.id}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        mode: 'cors'
      });
      alert('処理を開始しました！');
      fetchJob();
    } catch (error) { alert('エラーが発生しました'); } 
    finally { setIsRequesting(false); }
  };

  const handleExportPDF = () => window.print();

  const MetricsBar = ({ label, value, color }: { label: string, value: number, color: string }) => (
    <div className="mb-4">
      <div className="flex justify-between text-xs font-bold text-slate-500 mb-1"><span>{label}</span><span>{value}%</span></div>
      <div className="w-full bg-gray-200 rounded-full h-2.5"><div className={`h-2.5 rounded-full ${color}`} style={{ width: `${value}%` }}></div></div>
    </div>
  );

  const filteredSegments = segments.filter(s => searchQuery === '' || s.text.includes(searchQuery) || s.speaker.includes(searchQuery));
  
  const toggleSelection = (id: number) => setSelectedIndices(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  const toggleSelectAll = () => {
    const visibleIds = filteredSegments.map(s => s.id);
    const allSelected = visibleIds.every(id => selectedIndices.includes(id));
    setSelectedIndices(prev => allSelected ? prev.filter(id => !visibleIds.includes(id)) : Array.from(new Set([...prev, ...visibleIds])));
  };

  if (loading) return <div className="text-center py-20 text-slate-500">Loading...</div>;
  if (!job) return <div className="text-center py-20 text-slate-500">Job not found</div>;
  const metrics: Metrics = job.metrics || { transparency: 50, passion: 50, risk: 0 };

  // 翻訳コントロールコンポーネント
  const TranslateControl = () => (
    <div className="flex justify-end gap-2 mb-4 print:hidden">
      <select className="text-xs border rounded p-1" value={targetLang} onChange={(e: any) => setTargetLang(e.target.value)}>
        <option value="JA">日本語</option>
        <option value="EN">English</option>
        <option value="TH">Thai</option>
      </select>
      <button onClick={() => handleAnalyze('TRANSLATE')} className="text-xs bg-slate-100 hover:bg-slate-200 px-3 py-1 rounded font-bold flex items-center gap-1">
        <Globe size={14}/> 翻訳実行
      </button>
    </div>
  );

  return (
    <main className="min-h-screen bg-[#f5f5f7] text-slate-800 font-sans pb-20 print:bg-white">
      <div className="bg-white border-b border-slate-200 p-6 sticky top-0 z-20 shadow-sm print:hidden">
        <div className="flex justify-between items-center mb-2">
           <Link href="/" className="text-slate-400 text-sm hover:text-blue-600 flex items-center gap-1">← Back</Link>
           <div className="flex gap-2">
             {!isEditing && <button onClick={handleDelete} className="flex items-center gap-1 text-xs px-3 py-1 rounded border border-red-200 text-red-500 hover:bg-red-50 font-bold"><Trash2 size={14}/> Delete</button>}
             <button onClick={() => isEditing ? handleSaveMeta() : setIsEditing(true)} className={`flex items-center gap-1 text-xs px-3 py-1 rounded border font-bold ${isEditing ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-300 hover:bg-slate-50'}`}>
               {isEditing ? <Save size={14}/> : <Edit3 size={14}/>} {isEditing ? 'Save' : 'Edit Info'}
             </button>
           </div>
        </div>
        {isEditing ? (
          <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-blue-100 animate-in fade-in">
            <div className="grid grid-cols-2 gap-4">
                <div><label className="text-xs font-bold text-slate-400">PROJECT NAME</label><input type="text" className="w-full p-2 border rounded text-sm" value={editForm.projectName} onChange={e => setEditForm({...editForm, projectName: e.target.value})} /></div>
                <div><label className="text-xs font-bold text-slate-400">CLIENT NAME</label><input type="text" className="w-full p-2 border rounded text-sm" value={editForm.clientName} onChange={e => setEditForm({...editForm, clientName: e.target.value})} /></div>
            </div>
            <div><label className="text-xs font-bold text-slate-400">RAW TRANSCRIPT</label><textarea className="w-full p-2 border rounded text-xs font-mono h-32" value={editForm.transcript} onChange={e => setEditForm({...editForm, transcript: e.target.value})}/></div>
            <div className="pt-2 border-t border-blue-100">
              <label className="text-xs font-bold text-slate-400 mb-2 block">SPEAKER MAPPING (A-E)</label>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {['Speaker A', 'Speaker B', 'Speaker C', 'Speaker D', 'Speaker E'].map((k) => (
                  <div key={k} className="min-w-[100px] flex-shrink-0">
                    <span className="text-[10px] text-blue-500 font-bold">{k}</span>
                    <input type="text" className="w-full p-1 border rounded text-xs" placeholder="Name" value={speakerMap[k] || ''} onChange={(e) => setSpeakerMap({ ...speakerMap, [k]: e.target.value })} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-xl font-bold text-slate-800">{job.projectName || job.fileName}</h1>
              <p className="text-sm text-slate-500 mt-1">{job.clientName && <span className="font-bold text-blue-600 mr-2">🏢 {job.clientName}</span>}<span className="opacity-70">{new Date(job.createdAt).toLocaleString()}</span></p>
            </div>
            <div className="flex gap-2">
                <button onClick={handleExportPDF} className="p-2 text-slate-400 hover:text-slate-600" title="Print/PDF"><Download size={18}/></button>
                <span className={`px-3 py-1 rounded-full text-xs font-bold flex items-center ${job.status === 'COMPLETED' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{job.status}</span>
            </div>
          </div>
        )}
      </div>

      <div className="flex border-b border-slate-200 bg-white sticky top-[130px] z-10 print:hidden">
        {[
            {id: 'TRANSCRIPT', label: '📝 文字起こし(検索)', icon: FileText},
            {id: 'NARRATIVE', label: '📜 ナラティブ', icon: FileText},
            {id: 'BUSINESS', label: '🛡️ 議事録・分析', icon: CheckSquare},
            {id: 'PPT', label: '📊 PPT下書き', icon: MonitorPlay},
        ].map((t) => (
          <button key={t.id} onClick={() => setActiveTab(t.id as any)} className={`flex-1 py-3 text-xs sm:text-sm font-bold transition-colors border-b-2 flex justify-center items-center gap-2 ${activeTab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>

      <div className="p-6 max-w-5xl mx-auto min-h-screen">
        {activeTab === 'TRANSCRIPT' && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
             <div className="flex gap-2 mb-6 sticky top-0 bg-white pb-4 pt-2 border-b z-0">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
                    <input type="text" className="w-full pl-10 pr-4 py-2 border rounded-full bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-blue-200" placeholder="キーワード検索..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}/>
                </div>
                {selectedIndices.length > 0 && (
                    <button onClick={() => handleAnalyze('PARTIAL_SUMMARY')} disabled={isRequesting} className="bg-indigo-600 text-white px-4 py-2 rounded-full text-xs font-bold hover:bg-indigo-700 shadow flex items-center gap-2">
                        {isRequesting ? <RefreshCw className="animate-spin" size={14}/> : <FileText size={14}/>} 選択範囲を要約 ({selectedIndices.length})
                    </button>
                )}
             </div>
             <div className="space-y-4">
                {searchQuery && (<div className="mb-2 flex items-center gap-2"><input type="checkbox" onChange={toggleSelectAll} className="w-4 h-4" /><span className="text-xs font-bold text-slate-500">表示中の {filteredSegments.length} 件をすべて選択</span></div>)}
                {filteredSegments.length > 0 ? filteredSegments.map((seg) => {
                    const mappedName = speakerMap[seg.speaker] || seg.speaker;
                    const isSelected = selectedIndices.includes(seg.id);
                    return (
                        <div key={seg.id} className={`flex gap-3 p-3 rounded hover:bg-slate-50 transition-colors ${isSelected ? 'bg-indigo-50 border border-indigo-100' : ''}`}>
                             <div className="pt-1"><button onClick={() => toggleSelection(seg.id)}>{isSelected ? <CheckSquare className="text-indigo-600" size={20}/> : <Square className="text-slate-300" size={20}/>}</button></div>
                             <div><div className="text-xs font-bold text-blue-600 mb-1">{mappedName}</div><div className="text-sm text-gray-800 leading-relaxed">{seg.text}</div></div>
                        </div>
                    );
                }) : <div className="text-center py-10 text-slate-400">No matches found.</div>}
             </div>
          </div>
        )}
        {activeTab === 'NARRATIVE' && (
          <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200">
            {job.narrative ? (<div><TranslateControl /><pre className="whitespace-pre-wrap font-sans text-gray-800 leading-loose text-base">{job.narrative}</pre></div>) : 
              <div className="text-center py-12"><p className="mb-4 text-slate-500">ナラティブ要約を作成しますか？</p><button onClick={() => handleAnalyze('NARRATIVE')} disabled={isRequesting} className="bg-blue-600 text-white px-6 py-2 rounded-full font-bold shadow hover:bg-blue-700">Generate Narrative</button></div>}
          </div>
        )}
        {activeTab === 'BUSINESS' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="space-y-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <h3 className="text-sm font-bold text-gray-700 mb-4 border-b pb-2">📊 Sentiment Analysis</h3>
                    <MetricsBar label="Transparency (透明性)" value={metrics.transparency} color="bg-blue-500" />
                    <MetricsBar label="Passion (熱意)" value={metrics.passion} color="bg-red-500" />
                    <MetricsBar label="Risk Level (リスク)" value={metrics.risk} color="bg-amber-500" />
                </div>
                {job.tags && (<div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200"><h3 className="text-sm font-bold text-gray-700 mb-3">Tags</h3><div className="flex flex-wrap gap-2">{job.tags.split(',').map((tag: string, i: number) => (<span key={i} className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">#{tag.trim()}</span>))}</div></div>)}
            </div>
            <div className="lg:col-span-2 space-y-6">
                <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200">
                  {/* ★修正: 議事録タブにも翻訳ボタン追加 */}
                  {job.shieldOutput ? (<div><TranslateControl /><pre className="whitespace-pre-wrap font-sans text-gray-800 leading-loose text-sm">{job.shieldOutput}</pre></div>) : 
                    <div className="text-center py-12"><button onClick={() => handleAnalyze('BUSINESS')} disabled={isRequesting} className="bg-emerald-600 text-white px-6 py-2 rounded-full font-bold shadow hover:bg-emerald-700">Generate Minutes</button></div>}
                </div>
                {job.spearOutput && Array.isArray(job.spearOutput) && job.spearOutput.length > 0 && (
                  <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-red-500">
                      <h3 className="text-red-600 font-bold mb-4 flex items-center gap-2"><CheckSquare size={18}/> Action Items</h3>
                      <ul className="space-y-3">{job.spearOutput.map((item: any, idx: number) => (<li key={idx} className="flex flex-col sm:flex-row sm:items-center gap-2 text-sm border-b border-gray-100 pb-2"><span className="font-bold text-gray-700 bg-gray-100 px-2 py-1 rounded w-fit text-xs">{item.who || 'Anyone'}</span><span className="text-red-500 text-xs font-bold whitespace-nowrap">{item.when}</span><span className="text-gray-800 flex-1">{item.what}</span></li>))}</ul>
                  </div>
                )}
            </div>
          </div>
        )}
        {activeTab === 'PPT' && (
            <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 min-h-[500px]">
                <div className="mb-6 flex justify-between items-center">
                    <div><h3 className="font-bold text-lg text-slate-700">PowerPoint Draft (Markdown)</h3><p className="text-xs text-slate-500">Copy this text and paste it into Gamma AI.</p></div>
                    <button onClick={() => handleAnalyze('PPT')} disabled={isRequesting} className="bg-orange-500 text-white px-4 py-2 rounded-full font-bold shadow hover:bg-orange-600 flex items-center gap-2">{isRequesting ? <RefreshCw className="animate-spin" size={16}/> : <MonitorPlay size={16}/>} Generate / Update</button>
                </div>
                {pptOutput ? (
                    <div className="relative group"><textarea className="w-full h-[500px] p-4 bg-slate-900 text-slate-100 font-mono text-sm rounded-lg leading-relaxed" readOnly value={pptOutput} /><button className="absolute top-4 right-4 bg-white/10 hover:bg-white/30 text-white px-3 py-1 rounded text-xs backdrop-blur-sm" onClick={() => navigator.clipboard.writeText(pptOutput).then(() => alert('Copied!'))}>Copy to Clipboard</button></div>
                ) : <div className="text-center py-20 bg-slate-50 rounded-lg border border-dashed border-slate-300"><p className="text-slate-400 mb-4">No PPT draft generated yet.</p></div>}
            </div>
        )}
      </div>
    </main>
  );
}