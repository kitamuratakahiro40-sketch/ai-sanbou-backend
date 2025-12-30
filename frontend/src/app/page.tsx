import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";
import { redirect } from "next/navigation";
import HomeClient from "./HomeClient"; // 上で作ったファイルを読み込む

export default async function Page() {
  // 1. サーバー側でセッションを確認
  const session = await getServerSession(authOptions);

  // 2. 未ログインならログイン画面へ（Middlewareでも守っていますが、ここでもガード）
  if (!session) {
    redirect("/api/auth/signin");
  }

  // 3. ログイン済みなら、これまでの「長いコード」を表示
  // session 情報を渡せるので、Client側で名前などを表示できます
  return <HomeClient session={session} />;
}