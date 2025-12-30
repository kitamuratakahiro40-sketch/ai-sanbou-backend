import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import jobsRouter from './routes/jobs';
import uploadRouter from './routes/upload';

const app = express();
const PORT = process.env.PORT || 8080;

// 1. CORS設定 (ヘッダーを明示的に許可)
app.use(cors({
  origin: true,
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'Pragma'] 
}));

// 2. ログ出力 (デバッグ用: ここでヘッダーを確認します)
app.use((req, res, next) => {
  console.log(`🔍 [Incoming] ${req.method} ${req.url}`);
  console.log('   Headers:', JSON.stringify(req.headers)); // ★ヘッダーをすべて記録
  next();
});

// 3. JSON翻訳機 (ここが最重要！)
app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// --- Routes ---
app.get('/', (req, res) => {
  res.status(200).send('API is running');
});

app.use('/api/jobs', jobsRouter);
app.use('/api/upload', uploadRouter);

// --- Server Start ---
app.listen(PORT, () => {
  console.log(`🚀 API Service listening on port ${PORT}`);
});