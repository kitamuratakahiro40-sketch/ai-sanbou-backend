import type { Metadata } from "next";
import "./globals.css"; // ★ここでCSSを読み込みます

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
      {/* 背景色をglobals.cssで指定した変数に合わせる */}
      <body className="bg-sanbou-dark text-sanbou-light min-h-screen">
        {children}
      </body>
    </html>
  );
}