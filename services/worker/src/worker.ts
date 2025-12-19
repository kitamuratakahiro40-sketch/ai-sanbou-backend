import 'dotenv/config';
import { Worker } from 'bullmq';
import { geminiProcessor } from './services/gemini'; // 前回作ったgemini.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Redisの設定
const redisConnection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

console.log('🚀 Worker is starting...');
console.log(`🔌 Connecting to Redis at ${redisConnection.host}:${redisConnection.port}`);

// ★重要: API側のキュー名 'job-queue' と完全に一致させること！
const worker = new Worker(
  'job-queue', 
  async (job) => {
    console.log(`📥 Received Job: ${job.data.jobId} (Action: ${job.data.action})`);
    
    try {
      // gemini.ts の処理を呼び出す
      await geminiProcessor.processJob(
          job.data.jobId, 
          job.data.action,
          job.data.options // 翻訳や部分要約用のオプション
      );
      console.log(`✅ Job ${job.data.jobId} Completed.`);
    } catch (error) {
      console.error(`❌ Job ${job.data.jobId} Failed:`, error);
      throw error; // BullMQに失敗を通知
    }
  },
  { 
    connection: redisConnection,
    concurrency: 5 // 同時に5個まで処理（お好みで調整）
  }
);

worker.on('ready', () => {
  console.log('✅ Worker is listening for jobs on "job-queue"...');
});

worker.on('failed', (job, err) => {
  console.error(`🔥 Job ${job?.id} failed with error: ${err.message}`);
});

worker.on('error', (err) => {
  console.error('💀 Worker error:', err);
});