"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const jobs_1 = __importDefault(require("./routes/jobs"));
const upload_1 = __importDefault(require("./routes/upload"));
const gamma_1 = __importDefault(require("./routes/gamma")); // 👈 1. 追加: Gamma窓口をインポート
const app = (0, express_1.default)();
const PORT = process.env.PORT || 8080;
// 1. CORS設定 (ヘッダーを明示的に許可)
app.use((0, cors_1.default)({
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
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.use((0, cookie_parser_1.default)());
// --- Routes ---
app.get('/', (req, res) => {
    res.status(200).send('API is running');
});
app.use('/api/jobs', jobs_1.default);
app.use('/api/upload', upload_1.default);
app.use('/api/gamma', gamma_1.default); // 👈 2. 追加: Gammaへの道を開通
// --- Server Start ---
app.listen(PORT, () => {
    console.log(`🚀 API Service listening on port ${PORT}`);
});
