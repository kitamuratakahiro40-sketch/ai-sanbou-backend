import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { PrismaClient } from "@prisma/client"

// Prismaクライアントのインスタンス化（グローバル変数での保持を推奨しますが、まずはシンプルに）
const prisma = new PrismaClient()

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
providers: [
    Google({
      // ▼▼▼ NEXTAUTH_ から読み込むように修正 ▼▼▼
      clientId: process.env.NEXTAUTH_GOOGLE_ID,
      clientSecret: process.env.NEXTAUTH_GOOGLE_SECRET,
    }),
  ],
  
  callbacks: {
    // セッションにユーザーIDを含める（DB操作で必要になるため）
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id
      }
      return session
    },
  },
  // 開発環境でのデバッグ用
  debug: process.env.NODE_ENV === "development",
})