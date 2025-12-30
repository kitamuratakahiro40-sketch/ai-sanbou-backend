/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },

  typescript: {
    ignoreBuildErrors: true, 
  },

  async rewrites() {
    console.log("★★★ PROXYING TO CLOUD API ★★★");
    return [
      {
        source: '/api/:path((?!auth).*)',
        // 【修正ポイント】本番の API URL を直接指定します
        destination: 'https://api-service-649523701953.asia-northeast1.run.app/api/:path*',
      },
    ];
  },
};

export default nextConfig;