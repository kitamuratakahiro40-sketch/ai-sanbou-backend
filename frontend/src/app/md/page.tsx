"use client";

import React from 'react';
import { 
  Wallet, Users, FileText, Shield, 
  TrendingUp, ExternalLink, AlertTriangle, CheckCircle 
} from 'lucide-react';

// ★MDプレゼン用のダミーデータ（ここを書き換えれば画面の数字が変わります）
const MOCK_DATA = {
  orgName: "FST Thailand",
  wallet: {
    plan: "Business (Annual)",
    tokens: 4200000,
    maxTokens: 5000000,
    expiry: "2027/01/15",
    gammaCredits: 380,
    maxGamma: 400
  },
  members: [
    { name: "田中（製造）", summaryCount: 12, pptCount: 2, tokens: "450k", lastActive: "2時間前", status: "active" },
    { name: "ソムチャイ", summaryCount: 8, pptCount: 0, tokens: "120k", lastActive: "昨日", status: "idle" },
    { name: "佐藤（営業）", summaryCount: 5, pptCount: 5, tokens: "800k", lastActive: "10分前", status: "active" },
    { name: "鈴木（経理）", summaryCount: 3, pptCount: 1, tokens: "50k", lastActive: "3日前", status: "idle" },
  ],
  reports: [
    { date: "01/21 14:00", author: "佐藤", title: "【客先商談】A社工期短縮の要請について", type: "Sales" },
    { date: "01/21 11:30", author: "田中", title: "【現場会議】第3ラインの歩留まり改善案", type: "Factory" },
    { date: "01/20 17:00", author: "ソムチャイ", title: "【面談ログ】新人工員の離職防止策", type: "HR" },
    { date: "01/20 09:00", author: "北村", title: "【週報】AI導入による工数削減効果", type: "Mgmt" },
  ]
};

export default function MDDashboard() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-20">
      {/* Header */}
      <header className="bg-slate-900 text-white p-6 shadow-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-wider flex items-center gap-2">
              <Shield className="text-emerald-400" />
              AI参謀 <span className="text-slate-400 text-sm font-normal border-l border-slate-600 pl-3 ml-1">Organization Board</span>
            </h1>
            <p className="text-xs text-slate-400 mt-1 ml-1">Connected: {MOCK_DATA.orgName}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <div className="text-xs text-slate-400">Current User</div>
              <div className="text-sm font-bold">Managing Director</div>
            </div>
            <div className="bg-emerald-600 w-10 h-10 rounded-full flex items-center justify-center font-bold shadow-md ring-2 ring-emerald-400/50">
              MD
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-8 animate-in fade-in duration-700">
        
        {/* 1. 経営者向け KPIサマリー (Wallet) */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* 左: トークン残量 */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 col-span-2 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition">
              <Wallet size={100} className="text-indigo-600"/>
            </div>
            <h2 className="text-sm font-bold text-slate-400 mb-6 flex items-center gap-2 uppercase tracking-wide">
               Budget & Resources
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 relative z-10">
              <div>
                <div className="text-xs text-slate-500 mb-1">現在の契約プラン</div>
                <div className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                  {MOCK_DATA.wallet.plan}
                  <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full border border-indigo-200">Active</span>
                </div>
                <div className="text-xs text-slate-400 mt-2">次回更新日: {MOCK_DATA.wallet.expiry}</div>
              </div>
              <div>
                <div className="flex justify-between items-end mb-1">
                  <div className="text-xs text-slate-500">AIトークン消化率</div>
                  <div className="text-xs font-bold text-indigo-600">84%</div>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-slate-800">{MOCK_DATA.wallet.tokens.toLocaleString()}</span>
                  <span className="text-sm text-slate-400">/ {MOCK_DATA.wallet.maxTokens.toLocaleString()}</span>
                </div>
                <div className="w-full bg-slate-100 h-3 rounded-full mt-3 overflow-hidden">
                  <div className="bg-gradient-to-r from-indigo-500 to-purple-500 h-full rounded-full" style={{ width: '84%' }}></div>
                </div>
                <p className="text-[10px] text-slate-400 mt-2 text-right">※ 今月の予算内です</p>
              </div>
            </div>
          </div>
          
          {/* 右: Gammaクレジット */}
          <div className="bg-gradient-to-br from-indigo-900 to-slate-900 text-white p-6 rounded-2xl shadow-lg flex flex-col justify-between relative overflow-hidden">
            <div className="absolute -bottom-4 -right-4 bg-indigo-500/20 w-32 h-32 rounded-full blur-2xl"></div>
            <div>
              <div className="flex justify-between items-start">
                <div className="text-xs text-indigo-300 mb-1">スライド生成 (Gamma)</div>
                <TrendingUp size={16} className="text-emerald-400"/>
              </div>
              <div className="text-4xl font-bold mt-2">{MOCK_DATA.wallet.gammaCredits} <span className="text-sm font-normal text-indigo-300">/ 400</span></div>
            </div>
            <button className="w-full mt-6 bg-white/10 hover:bg-white/20 text-white text-sm py-3 rounded-lg transition border border-white/10 backdrop-blur-sm flex items-center justify-center gap-2">
              <ExternalLink size={14}/> リソースを追加購入
            </button>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* 2. 組織のインサイト (Reports) */}
          <section className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h2 className="text-lg font-bold text-slate-700 flex items-center gap-2">
                <FileText size={20} className="text-orange-500"/> 最新の意思決定レポート
              </h2>
              <button className="text-xs font-bold text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded transition">すべて見る</button>
            </div>
            <div className="divide-y divide-slate-100">
              {MOCK_DATA.reports.map((report, idx) => (
                <div key={idx} className="p-5 hover:bg-orange-50/20 transition cursor-pointer group flex gap-4 items-start">
                  <div className="mt-1 min-w-[40px] flex flex-col items-center">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500 group-hover:bg-orange-100 group-hover:text-orange-600 transition">
                      {report.author.slice(0,1)}
                    </div>
                  </div>
                  <div className="flex-1">
                     <div className="flex justify-between text-xs text-slate-400 mb-1">
                        <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">{report.type}</span>
                        <span>{report.date}</span>
                     </div>
                     <h3 className="text-sm font-bold text-slate-700 group-hover:text-orange-600 transition mb-1">
                        {report.title}
                     </h3>
                     <p className="text-xs text-slate-400 line-clamp-1">
                        AIによる要約: 議論の主要なポイントはコスト削減と品質維持のトレードオフに集中しており...
                     </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 右カラム: メンバー状況 & セキュリティ */}
          <div className="space-y-8">
            
            {/* 3. メンバー稼働状況 */}
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-5 border-b border-slate-100">
                 <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <Users size={18} className="text-blue-500"/> メンバー稼働状況
                </h2>
              </div>
              <ul className="divide-y divide-slate-50">
                {MOCK_DATA.members.map((member, idx) => (
                  <li key={idx} className="p-4 flex items-center justify-between hover:bg-slate-50 transition">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${member.status === 'active' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-slate-300'}`}></div>
                      <div>
                        <div className="text-sm font-bold text-slate-700">{member.name}</div>
                        <div className="text-[10px] text-slate-400">最終: {member.lastActive}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-bold text-indigo-600">{member.summaryCount}回</div>
                      <div className="text-[10px] text-slate-400">要約実行</div>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="p-3 text-center border-t border-slate-100 bg-slate-50">
                 <span className="text-xs text-slate-400">今週の総稼働: 42時間相当の削減</span>
              </div>
            </section>

            {/* 4. ガバナンス設定 */}
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 border-t-4 border-t-emerald-500">
              <h2 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                <Shield size={18} className="text-emerald-600"/> セキュリティ・統治
              </h2>
              
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                  <CheckCircle size={16} className="text-emerald-600 mt-0.5"/>
                  <div>
                    <div className="text-xs font-bold text-emerald-800">ステルスモード: 強制ON</div>
                    <p className="text-[10px] text-emerald-600/80 mt-1">全社員の入力データは学習に利用されません。</p>
                  </div>
                </div>

                <div className="flex items-center justify-between p-2">
                  <span className="text-xs text-slate-500">外部共有 (Domain Lock)</span>
                  <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-1 rounded">禁止中</span>
                </div>
                
                <button className="w-full border border-slate-300 text-slate-600 text-xs font-bold py-2 rounded hover:bg-slate-50 transition">
                  設定コンソールを開く
                </button>
              </div>
            </section>

          </div>
        </div>

      </main>
    </div>
  );
}