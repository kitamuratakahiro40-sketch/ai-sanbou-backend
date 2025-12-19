import { NextResponse } from 'next/server';
import { auth } from "@/auth";
import { PrismaClient } from "@prisma/client";

// データベース接続クライアントを作成
const prisma = new PrismaClient();

export async function GET(request: Request) {
  try {
    // 1. ログイン中のユーザーを確認
    const session = await auth();
    
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("🔍 Searching jobs for User ID:", session.user.id);

    // 2. 検索キーワードを取得（URLから）
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');

    // 3. データベースから検索
    const jobs = await prisma.job.findMany({
      where: {
        userId: session.user.id,
        ...(query ? {
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { summary: { contains: query, mode: 'insensitive' } },
          ]
        } : {})
      },
      orderBy: {
        createdAt: 'desc', // 新しい順
      },
    });

    console.log(`✅ Found ${jobs.length} jobs`);
    
    // 4. 結果を返す
    return NextResponse.json({ jobs });

  } catch (error) {
    console.error("❌ Jobs API Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
