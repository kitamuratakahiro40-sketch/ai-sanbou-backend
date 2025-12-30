import "dotenv/config";
import express from "express";
import { Worker } from "bullmq";
import { prisma } from "./prisma"; // ★作ったばかりのシングルトンを読み込む
import { geminiProcessor } from "./services/gemini"; // ★パスと名前を修正
import { AI_MODELS } from "./constants"; // ★Redis設定などはここにあっても良いが、今回は環境変数依存

// ---------------------------------------------------------
// 1. Health Check Server
// ---------------------------------------------------------
const app = express();
const PORT = Number(process.env.PORT) || 8080;

app.get("/", (_req, res) => res.status(200).send("OK"));
app.get("/healthz", (_req, res) => res.status(200).send("OK"));

app.listen(PORT, () => {
  console.log(`🏥 Health check server listening on port ${PORT}`);
});

// ---------------------------------------------------------
// 2. The Trinity Worker (BullMQ)
// ---------------------------------------------------------
const REDIS_URL = process.env.REDIS_URL || "redis://10.56.141.51:6379";

const connection = {
  host: '10.56.141.51', // チャゲ先輩のIP
  port: 6379,
  // 本番環境で REDIS_URL がある場合はパースして使うロジックが必要だが、一旦IP指定で進める
};

console.log("🚀 Worker System Online. Connecting to Queue...");

const worker = new Worker(
  "sanbou-job-queue", 
  async (job) => {
    console.log(`🔥 Job [${job.id}] started. Action: ${job.data.action}`);
    
    // DB更新 (Processing)
    await prisma.job.update({
      where: { id: job.data.jobId },
      data: { status: "PROCESSING" }
    });

    try {
      // ★ Gemini Processor を呼び出す
      // job.data には { jobId, action, options } が入っている
      const result = await geminiProcessor.processJob(
        job.data.jobId, 
        job.data.action, 
        job.data.options
      );
      
      console.log(`✅ Job [${job.id}] completed.`);
      return result;

    } catch (error: any) {
      console.error(`❌ Job [${job.id}] failed:`, error);
      // FAILED更新は gemini.ts 内でもやっているが、念のためここでもキャッチ
      throw error; 
    }
  },
  {
    connection,
    concurrency: 5, 
    lockDuration: 60 * 60 * 1000, // 60分
    maxStalledCount: 0, 
  }
);

// Graceful Shutdown
process.on("SIGTERM", async () => {
  console.log("🛑 SIGTERM received.");
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
});