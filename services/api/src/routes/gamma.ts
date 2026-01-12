import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { createPresentation, checkGammaStatus } from '../services/gamma';

const router = express.Router();
const prisma = new PrismaClient();

// ---------------------------------------------------------
// 1. PPTX生成の依頼を受け取る
// ---------------------------------------------------------
router.post('/generate', async (req: Request, res: Response) => {
  try {
    console.log("📨 [Gamma Route] Received generation request");
    
    const { jobId, pageCount } = req.body;
    
    if (!jobId) return res.status(400).json({ error: "Job ID is required" });

    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job || !job.pptOutput) return res.status(404).json({ error: "Job/Markdown not found." });

    const targetPages = pageCount ? parseInt(pageCount) : 4;
    
    // Gammaに発注
    const gammaResult = await createPresentation(job.pptOutput, job.userId || "unknown", targetPages);

    console.log("🔍 Gamma Raw Response:", JSON.stringify(gammaResult));

    // 🔥 修正完了: id ではなく generationId を取得する！
    const finalGammaId = gammaResult.generationId || gammaResult.id;

    return res.json({ 
      success: true, 
      gammaId: finalGammaId, // これでフロントエンドにIDが渡ります
      status: "pending"
    });

  } catch (error: any) {
    const detailedError = error.response?.data || error.message;
    console.error("❌ Gamma Route Error:", JSON.stringify(detailedError));
    return res.status(500).json({ error: typeof detailedError === 'object' ? JSON.stringify(detailedError) : detailedError });
  }
});

// ---------------------------------------------------------
// 2. 状況確認
// ---------------------------------------------------------
router.get('/status/:gammaId', async (req: Request, res: Response) => {
  try {
    const { gammaId } = req.params;
    if (gammaId === "undefined" || !gammaId) {
        return res.status(400).json({ error: "Invalid Gamma ID" });
    }
    const statusData = await checkGammaStatus(gammaId);
    
    // 状況確認の結果もログに出しておく（念のため）
    console.log("🔍 Status Check Result:", JSON.stringify(statusData));
    
    return res.json(statusData);
  } catch (error: any) {
    const detailedError = error.response?.data || error.message;
    return res.status(500).json({ error: detailedError });
  }
});

export default router;