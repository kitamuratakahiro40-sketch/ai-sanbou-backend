"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiService = exports.AiProcessingService = void 0;
const vertexai_1 = require("@google-cloud/vertexai");
const prompts_1 = require("../config/prompts");
const PROJECT_ID = process.env.PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
const LOCATION = 'us-central1';
class AiProcessingService {
    constructor() {
        // 最新モデルを指定
        this.modelName = 'gemini-2.5-flash-preview-09-2025';
        this.vertexAI = new vertexai_1.VertexAI({
            project: PROJECT_ID || 'your-project-id', // 環境変数がなければプレースホルダー
            location: LOCATION,
        });
    }
    async generateOutput(inputContent, mode) {
        try {
            const model = this.vertexAI.getGenerativeModel({
                model: this.modelName,
                generationConfig: {
                    maxOutputTokens: 8192,
                    temperature: 0.2,
                    topP: 0.8,
                    topK: 40,
                },
            });
            const systemInstruction = prompts_1.SYSTEM_PROMPTS[mode];
            const prompt = `
${systemInstruction}

---
【入力テキスト】
${inputContent}
---
`;
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) {
                throw new Error('No content generated from AI');
            }
            return text;
        }
        catch (error) {
            console.error(`AI Generation failed:`, error);
            throw error;
        }
    }
}
exports.AiProcessingService = AiProcessingService;
exports.aiService = new AiProcessingService();
