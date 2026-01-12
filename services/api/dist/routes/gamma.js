"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const client_1 = require("@prisma/client"); // 👈 1. 設計図をインポート
const gamma_1 = require("../services/gamma");
const router = express_1.default.Router();
const prisma = new client_1.PrismaClient(); // 👈 2. ここで自分用の「電話機（接続）」を作る
// ---------------------------------------------------------
// 1. PPTX生成の依頼を受け取る
// ---------------------------------------------------------
router.post('/generate', async (req, res) => {
    try {
        console.log("📨 [Gamma Route] Received generation request");
        const { jobId, pageCount } = req.body;
        if (!jobId) {
            return res.status(400).json({ error: "Job ID is required" });
        }
        const job = await prisma.job.findUnique({
            where: { id: jobId }
        });
        if (!job || !job.pptOutput) {
            console.error("❌ Job or PPT content not found");
            return res.status(404).json({ error: "Job or Markdown content not found. Analysis might not be finished." });
        }
        const targetPages = pageCount ? parseInt(pageCount) : 4;
        const gammaResult = await (0, gamma_1.createPresentation)(job.pptOutput, job.userId || "unknown", targetPages);
        return res.json({
            success: true,
            gammaId: gammaResult.id,
            status: "pending"
        });
    }
    catch (error) {
        console.error("❌ Gamma Route Error:", error.message);
        return res.status(500).json({ error: error.message });
    }
});
// ---------------------------------------------------------
// 2. 状況確認＆ダウンロードリンク取得
// ---------------------------------------------------------
router.get('/status/:gammaId', async (req, res) => {
    try {
        const { gammaId } = req.params;
        const statusData = await (0, gamma_1.checkGammaStatus)(gammaId);
        return res.json(statusData);
    }
    catch (error) {
        console.error("❌ Gamma Status Error:", error.message);
        return res.status(500).json({ error: error.message });
    }
});
exports.default = router;
