"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config"); // 環境変数を読み込む
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const upload_1 = __importDefault(require("./routes/upload"));
const jobs_1 = __importDefault(require("./routes/jobs"));
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3001;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// ルーティング
app.use('/api/upload', upload_1.default); // 署名付きURL発行用
app.use('/api/jobs', jobs_1.default); // ジョブ管理用
app.get('/', (req, res) => {
    res.send('🚀 AI-Sanbou API v2 is running!');
});
app.listen(PORT, () => {
    console.log(`🚀 API Server ready at http://localhost:${PORT}`);
});
