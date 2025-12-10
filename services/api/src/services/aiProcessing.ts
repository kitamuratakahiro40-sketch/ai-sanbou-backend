import { VertexAI } from '@google-cloud/vertexai';
import { SYSTEM_PROMPTS, OutputMode } from '../config/prompts';

const PROJECT_ID = process.env.PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
const LOCATION = 'us-central1';

export class AiProcessingService {
  private vertexAI: VertexAI;
  // 最新モデルを指定
  private modelName: string = 'gemini-2.5-flash-preview-09-2025';

  constructor() {
    this.vertexAI = new VertexAI({
      project: PROJECT_ID || 'your-project-id', // 環境変数がなければプレースホルダー
      location: LOCATION,
    });
  }

  async generateOutput(inputContent: string, mode: OutputMode): Promise<string> {
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

      const systemInstruction = SYSTEM_PROMPTS[mode];
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

    } catch (error) {
      console.error(`AI Generation failed:`, error);
      throw error;
    }
  }
}

export const aiService = new AiProcessingService();