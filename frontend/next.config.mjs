/** @type {import('next').NextConfig} */
const nextConfig = {
  // すでに他の設定がある場合は、この rewrites ブロックを追記してください
  async rewrites() {
    return [
      {

        // バックエンド(8080番)の /api/jobs へ転送する
        source: '/api/jobs/:path*',
        destination: 'http://127.0.0.1:3001/api/jobs/:path*',
      },
    ];
  },
};

export default nextConfig;
