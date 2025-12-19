import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import jobRoutes from './routes/jobs';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// ★ここが修正ポイント: CORSを最強設定にする
app.use(cors({
  origin: true, // すべてのオリジンを許可（スマホからのアクセスを拒否しない）
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'], // OPTIONSを明示的に許可
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
}));

// プリフライトリクエスト(OPTIONS)を強制的にOKにする
app.options('*', cors());

app.use(express.json());

// ルート設定
app.use('/api/jobs', jobRoutes);

// ヘルスチェック用
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// サーバー起動 (0.0.0.0 で待ち受け)
app.listen(Number(port), '0.0.0.0', () => {
  console.log(`🚀 API Server running on port ${port} (Accessible from Mobile)`);
});