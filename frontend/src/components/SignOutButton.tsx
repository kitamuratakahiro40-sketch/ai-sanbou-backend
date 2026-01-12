"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/" })} // ログアウト後にトップページ（ログイン画面）に戻る
      className="text-xs font-mono text-slate-500 hover:text-red-400 underline transition-colors"
    >
      [ ログアウト ]
    </button>
  );
}