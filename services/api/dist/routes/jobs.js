"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const bull_1 = __importDefault(require("bull"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const multer_1 = __importDefault(require("multer")); // 追加
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
const jobQueue = new bull_1.default('job-queue', {
    redis: { host: process.env.REDIS_HOST || '127.0.0.1', port: 6379 }
});
// ★ファイルの保存場所と名前の設定
const UPLOAD_DIR = path_1.default.join(__dirname, '../../uploads');
if (!fs_1.default.existsSync(UPLOAD_DIR)) {
    fs_1.default.mkdirSync(UPLOAD_DIR, { recursive: true });
}
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        // 日本語ファイル名文字化け対策 & 重複回避
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        // 元の拡張子を維持
        const ext = path_1.default.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
});
const upload = (0, multer_1.default)({ storage: storage });
// 1. ジョブ一覧取得
router.get('/', async (req, res) => {
    try {
        const jobs = await prisma.job.findMany({ orderBy: { createdAt: 'desc' }, take: 20 });
        res.json({ jobs });
    }
    catch (error) {
        res.status(500).json({ error: 'Error fetching jobs' });
    }
});
// 2. ジョブ詳細取得
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const job = await prisma.job.findUnique({ where: { id } });
        if (!job)
            return res.status(404).json({ error: 'Job not found' });
        res.json({ job });
    }
    catch (error) {
        res.status(500).json({ error: 'Error fetching job' });
    }
});
// 3. ★新規ジョブ作成 (ファイルアップロード対応)
// upload.single('file') がスマホからのファイルを受け止めます
router.post('/', upload.single('file'), async (req, res) => {
    try {
        console.log('📂 Upload Request Received');
        let finalSourceUrl = "";
        let fileName = "";
        let type = "AUDIO";
        const securityMode = req.body.securityMode || 'NORMAL';
        // A. ファイルがアップロードされた場合 (スマホ/PCから)
        if (req.file) {
            console.log(`✅ File uploaded: ${req.file.filename}`);
            finalSourceUrl = req.file.path; // 保存されたパス
            fileName = Buffer.from(req.file.originalname, 'latin1').toString('utf8'); // 文字化け対策（簡易）
            // 拡張子でタイプ判定
            if (fileName.endsWith('.txt'))
                type = 'TEXT';
            // 文字化け補正がうまくいかない場合のフォールバック
            if (!fileName || fileName.includes('??'))
                fileName = req.file.originalname;
        }
        // B. テキスト直接入力やパス指定の場合 (旧互換)
        else {
            const { content, storagePath, fileName: reqFileName, type: reqType } = req.body;
            fileName = reqFileName || 'Untitled';
            type = reqType || 'AUDIO';
            if (content) {
                type = 'TEXT';
                const txtPath = path_1.default.join(UPLOAD_DIR, `text-${Date.now()}.txt`);
                fs_1.default.writeFileSync(txtPath, content);
                finalSourceUrl = txtPath;
            }
            else {
                finalSourceUrl = storagePath;
            }
        }
        let user = await prisma.user.findFirst();
        if (!user)
            user = await prisma.user.create({ data: { email: 'demo@example.com', name: 'Demo User' } });
        const job = await prisma.job.create({
            data: {
                userId: user.id,
                type: type === 'TEXT' ? 'TEXT' : 'AUDIO',
                sourceUrl: finalSourceUrl,
                fileName: fileName,
                status: 'QUEUED',
                security: securityMode
            }
        });
        await jobQueue.add({ jobId: job.id });
        console.log(`🚀 Job ${job.id} queued!`);
        res.json({ job });
    }
    catch (error) {
        console.error('Error creating job:', error);
        res.status(500).json({ error: 'Failed to create job' });
    }
});
// 4. 更新
router.patch('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { speakerMap, tags } = req.body;
        const updatedJob = await prisma.job.update({
            where: { id },
            data: { speakerMap, tags }
        });
        res.json({ success: true, job: updatedJob });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to update job' });
    }
});
exports.default = router;
