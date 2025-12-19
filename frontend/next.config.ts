import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ★重要: ここでアップロード上限を緩和します (50MB)
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },

  // APIへの転送設定
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3001/api/:path*', // Mac内のAPIサーバーへ転送
      },
    ];
  },
};

export default nextConfig;