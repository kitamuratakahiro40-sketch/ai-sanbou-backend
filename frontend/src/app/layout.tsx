import type { Metadata } from "next";
import "./globals.css"; 
import { Providers } from "./providers"; // 🌟 作ったばかりの配給係を読み込む

export const metadata: Metadata = {
  title: "Sanbou-AI v2.0",
  description: "AI参謀 - Intelligence Hub",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="bg-sanbou-dark text-sanbou-light min-h-screen">
        {/* 🌟 アプリ全体を Providers で包むことで、どこでもログイン情報が使えるようになる */}
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}