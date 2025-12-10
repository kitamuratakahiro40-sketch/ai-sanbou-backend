import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers"; // または "../components/Providers"

export const metadata: Metadata = {
  title: "AI参謀 - Sanbou AI",
  description: "AI-powered meeting minutes and insights",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>
        {/* AuthProvider は削除しました。NextAuthはサーバーサイドでセッションを管理するため、
            クライアント側のProviderは必須ではありません（必要な場合のみSessionProviderを追加） */}
        <Providers>
        　{children}
        </Providers>
      </body>
    </html>
  );
}