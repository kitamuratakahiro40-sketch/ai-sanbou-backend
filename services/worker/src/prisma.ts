import { PrismaClient } from '@prisma/client';

// アプリケーション全体で1つだけの接続インスタンスを共有（Singleton）
export const prisma = new PrismaClient();