import { withAuth } from "next-auth/middleware";

// Next.js 16が求める「関数」を確実にエクスポートします
export default withAuth(
  function middleware(req) {
    // 独自の処理が必要なければ空でもOK
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

// 認証を適用するパスを指定
export const config = {
  matcher: ["/dashboard/:path*", "/api/user/:path*"], 
};