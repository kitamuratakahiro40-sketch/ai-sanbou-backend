import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";
import { redirect } from "next/navigation";
import HomeClient from "./HomeClient";
import { SignOutButton } from "@/components/SignOutButton"; // 👈 ボタンを読み込み

export default async function Page() {
  // 1. セッション確保
  const session = await getServerSession(authOptions);

  // 2. ガード
  if (!session) {
    redirect("/api/auth/signin");
  }

  // 3. 画面表示（ヘッダー ＋ メインコンテンツ）
  return (
    <main className="container mx-auto p-4">
      {/* ▼▼ 追加したヘッダー部分 ▼▼ */}
      <div className="flex justify-between items-end mb-8 border-b border-slate-800 pb-4">
        <div className="flex flex-col">
          <span className="font-bold text-2xl tracking-tight mb-1">AI参謀</span>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 font-mono">
              {session.user?.name || session.user?.email} 司令官の管理パネル
            </span>
            <SignOutButton /> {/* 👈 ここに配置！ */}
          </div>
        </div>
      </div>
      {/* ▲▲ 追加ここまで ▲▲ */}

      {/* メインのダッシュボード */}
      <HomeClient session={session} />
    </main>
  );
}