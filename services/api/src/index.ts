import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import jobsRouter from './routes/jobs';
import uploadRouter from './routes/upload';
import gammaRouter from './routes/gamma'; // 👈 1. 追加: Gamma窓口をインポート

const app = express();
const PORT = process.env.PORT || 8080;

// 1. CORS設定 (ヘッダーを明示的に許可)
app.use(cors({
  origin: true,
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'Pragma'] 
}));

// 2. ログ出力 (デバッグ用)
app.use((req, res, next) => {
  console.log(`🔍 [Incoming] ${req.method} ${req.url}`);
  // console.log('   Headers:', JSON.stringify(req.headers)); // ログがうるさければコメントアウトでもOK
  next();
});

// 3. JSON翻訳機
app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// --- Routes ---
app.get('/', (req, res) => {
  res.status(200).send('API is running');
});

app.use('/api/jobs', jobsRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/gamma', gammaRouter); // 👈 2. 追加: Gammaへの道を開通

// --- Server Start ---
app.listen(PORT, () => {
  console.log(`🚀 API Service listening on port ${PORT}`);
});