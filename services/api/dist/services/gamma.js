"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkGammaStatus = exports.createPresentation = void 0;
const axios_1 = __importDefault(require("axios"));
const GAMMA_API_KEY = process.env.GAMMA_API_KEY;
const GAMMA_API_URL = 'https://public-api.gamma.app/v1.0/generations';
/**
 * Gammaにスライド生成を依頼する
 * @param markdownContent スライドの元ネタ
 * @param userId ユーザーID
 * @param cardCount スライド枚数（指定なしなら4枚）
 */
const createPresentation = async (markdownContent, userId, cardCount = 4) => {
    if (!GAMMA_API_KEY)
        throw new Error("❌ GAMMA_API_KEY is missing in .env");
    console.log(`🚀 [Gamma] Requesting PPTX (${cardCount} slides) for User: ${userId}`);
    try {
        const response = await axios_1.default.post(GAMMA_API_URL, {
            inputText: markdownContent,
            textMode: "generate",
            format: "presentation",
            numCards: cardCount, // ユーザー指定の枚数
            // ★重要: PPTXファイルを生成させる設定
            exportAs: "pptx",
            textOptions: {
                language: "ja",
                amount: "medium",
                tone: "professional"
            },
            imageOptions: {
                source: "noImages" // ★重要: 画像なし（トークン節約＆ビジネス仕様）
            },
            cardOptions: {
                dimensions: "16x9",
                cardSplit: "auto",
            }
            // PPTXダウンロードの場合、sharingOptionsは必須ではありませんが、
            // 念のため閲覧権限をつけておくなら以下を有効化
            /*
            sharingOptions: {
              workspaceAccess: "edit",
              externalAccess: "view"
            }
            */
        }, {
            headers: {
                'X-API-KEY': GAMMA_API_KEY,
                'Content-Type': 'application/json'
            }
        });
        console.log(`✅ [Gamma] Job Started: ${response.data.id}`);
        return response.data;
    }
    catch (error) {
        console.error("❌ [Gamma] Creation Failed:", error.response?.data || error.message);
        throw error;
    }
};
exports.createPresentation = createPresentation;
/**
 * 生成状況を確認する（ポーリング用）
 */
const checkGammaStatus = async (jobId) => {
    if (!GAMMA_API_KEY)
        throw new Error("GAMMA_API_KEY is missing");
    try {
        const response = await axios_1.default.get(`${GAMMA_API_URL}/${jobId}`, {
            headers: { 'X-API-KEY': GAMMA_API_KEY }
        });
        // 完了すると response.data.file_url にPPTXのダウンロードリンクが入ります
        return response.data;
    }
    catch (error) {
        console.error(`❌ [Gamma] Status Check Failed for ${jobId}:`, error.message);
        throw error;
    }
};
exports.checkGammaStatus = checkGammaStatus;
