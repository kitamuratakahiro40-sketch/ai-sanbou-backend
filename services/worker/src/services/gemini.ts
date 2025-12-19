import 'dotenv/config';
import { VertexAI } from '@google-cloud/vertexai';
import { PrismaClient, JobStatus } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { Storage } from '@google-cloud/storage';

const prisma = new PrismaClient();
const storage = new Storage();

// Gemini 3 Flash Preview (Global endpoint)
const MODEL_NAME = 'gemini-3-flash-preview'; 
const PROJECT_ID = process.env.PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || 'sanbou-ai-project';
const LOCATION = 'global';

// ★改良版: ストリーミング対応のリトライ関数
async function generateWithRetry(model: any, request: any, label: string) {
  const maxRetries = 3;
  for (let i = 0; i < maxRetries; i++) {
    try {
      // ★変更点: generateContentStream を使用してタイムアウトを回避
      const streamingResp = await model.generateContentStream(request);
      
      let fullText = '';
      // ストリームから少しずつデータを受け取る
      for await (const item of streamingResp.stream) {
        if (item.candidates && item.candidates[0].content && item.candidates[0].content.parts) {
            fullText += item.candidates[0].content.parts[0].text || '';
        }
      }
      return fullText;

    } catch (error: any) {
      if (String(error).includes('429') || String(error).includes('503') || String(error).includes('500') || String(error).includes('TIMEOUT')) {
        const waitTime = 5000 * (i + 1);
        console.log(`[AI] ⏳ Gemini 3 is busy or timed out (${label}). Waiting ${waitTime / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      throw error;
    }
  }
  throw new Error(`Max retries reached for ${label}`);
}

export const geminiProcessor = {
  async processJob(jobId: string, action: string = 'TRANSCRIBE', options: any = {}) {
    console.log(`[AI] 🚀 Processing job: ${jobId} / Action: ${action} / Model: ${MODEL_NAME}`);
    
    try {
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS === "") delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

      const vertexAI = new VertexAI({ 
        project: PROJECT_ID, 
        location: LOCATION,
        apiEndpoint: 'aiplatform.googleapis.com'
      });
      
      const model = vertexAI.getGenerativeModel({ 
        model: MODEL_NAME,
        generationConfig: { 
            temperature: 0.2, 
            maxOutputTokens: 65536, 
            topP: 0.8,
            topK: 40
        }
      });

      const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
      await prisma.job.update({ where: { id: jobId }, data: { status: JobStatus.PROCESSING } });

      // ---------------------------------------------------------
      // ファイル準備
      // ---------------------------------------------------------
      let filePart = undefined;
      
      if (job.sourceUrl && action === 'TRANSCRIBE') {
        let localFilePath = job.sourceUrl;
        
        if (job.sourceUrl.startsWith('gs://')) {
            const parts = job.sourceUrl.replace('gs://', '').split('/');
            const bucketName = parts[0];
            const filePath = parts.slice(1).join('/');
            const tempDir = os.tmpdir();
            localFilePath = path.join(tempDir, path.basename(filePath));

            if (!fs.existsSync(localFilePath)) {
                try {
                    await storage.bucket(bucketName).file(filePath).download({ destination: localFilePath });
                } catch (e) {
                   console.warn("[AI] Local download skipped, using GCS URI.");
                }
            }
        }
        
        const mimeType = localFilePath.endsWith('.mp4') ? 'video/mp4' : 'audio/mp3';
        
        filePart = {
            fileData: {
                fileUri: job.sourceUrl, 
                mimeType: mimeType
            }
        };
      }

      let resultText = '';

      // =========================================================
      // CASE 1: 文字起こし (TRANSCRIBE)
      // =========================================================
      if (action === 'TRANSCRIBE') {
        if (job.type === 'TEXT') {
            resultText = job.rawText || "";
        } else {
            const prompt = `
あなたは法廷や重要会議を担当する「熟練の速記官」です。
提供された音声データの「詳細かつ正確な発言録」を作成してください。
内容は絶対に要約せず、発言された情報をすべて網羅してください。

【厳守ルール】
1. **要約禁止**: 短くまとめようとせず、長くても全て書き残すこと。
2. **フィラーのみ削除**: 「えー」「あー」「そのー」等の意味を持たない音だけを削除する。
3. **言い直しの処理**: 言い間違いを訂正した場合は、訂正後の発言のみを記録する。
4. **話者分離**: [Speaker A], [Speaker B] の形式で記述する。
5. **情報の維持**: 数値、固有名詞、感情的な表現、繰り返し強調された言葉は、そのまま残すこと。
`;
            console.log(`[AI] 🎙️ Transcribing with Gemini 3 Flash (Streaming Mode)...`);
            
            // ストリーミング実行
            resultText = await generateWithRetry(model, {
                contents: [{ role: 'user', parts: [filePart, { text: prompt }] }]
            }, "Transcription");
        }

        await prisma.job.update({ where: { id: jobId }, data: { transcript: resultText, status: JobStatus.COMPLETED } });
      }

      // =========================================================
      // CASE 2: ナラティブ要約 (ストーリー強化版)
      // =========================================================
      else if (action === 'NARRATIVE') {
        const sourceText = job.transcript || job.rawText || "";
        // ★先ほど合意したPLAUD参考の強化プロンプト
        const prompt = `
あなたは一流のビジネスライターです。
この会議の議事録を、読む人が会議の場にいたかのように追体験できる「詳細なナラティブ（物語形式）レポート」として再構成してください。

【執筆ルール】
1. **形式**: 時系列に沿った「物語」として記述すること。**箇条書きは絶対に使用せず**、すべて段落（パラグラフ）で構成してください。
2. **臨場感**: 「A氏は〜と指摘した」「これに対しB氏は強く反論し〜」のように、議論の熱量や対立構造、空気感を詳細に描写してください。
3. **直接引用**: 重要な発言は「 」（カギ括弧）を用いた直接引用で記述し、誰の言葉かを明確にしてください。
4. **構成**: 話題の転換点には「小見出し」を入れ、ストーリーの区切りを明確にしてください。
5. **詳細**: 決定事項やアクションアイテムも、箇条書きではなく「文脈」の中に太字で埋め込んでください。

【対象テキスト】
${sourceText.substring(0, 100000)}
`;
        console.log(`[AI] 📜 Generating Narrative (Story Mode)...`);
        resultText = await generateWithRetry(model, { contents: [{ role: 'user', parts: [{ text: prompt }] }] }, "Narrative");
        
        await prisma.job.update({ where: { id: jobId }, data: { narrative: resultText, status: JobStatus.COMPLETED } });
      }

      // =========================================================
      // CASE 3: ビジネス議事録
      // =========================================================
      else if (action === 'BUSINESS') {
        const sourceText = job.transcript || job.rawText || "";
        const prompt = `
この会議の「ビジネス議事録」を作成してください。
Markdown形式。

# 会議議事録

## 1. 決定事項
* ...

## 2. ネクストアクション
* ...

## 3. 議論の要点
* ...

## 4. 懸念点・リスク
* ...

【対象テキスト】
${sourceText.substring(0, 100000)}
`;
        console.log(`[AI] 🛡️ Generating Business Minutes...`);
        resultText = await generateWithRetry(model, { contents: [{ role: 'user', parts: [{ text: prompt }] }] }, "Business");
        
        const metrics = { transparency: 95, passion: 85, risk: 5 };

        await prisma.job.update({
          where: { id: jobId },
          data: {
            shieldOutput: resultText,
            metrics: metrics,
            status: JobStatus.COMPLETED
          }
        });
      }

      // =========================================================
      // CASE 4: 翻訳
      // =========================================================
      else if (action === 'TRANSLATE') {
        const targetLang = options.targetLang || 'English';
        const sourceInput = options.sourceText || "";
        const prompt = `Translate the following text to ${targetLang}. Keep Markdown format.\n\n${sourceInput.substring(0, 50000)}`;
        
        console.log(`[AI] 🌐 Translating...`);
        resultText = await generateWithRetry(model, { contents: [{ role: 'user', parts: [{ text: prompt }] }] }, "Translate");

        let updateData: any = { status: JobStatus.COMPLETED };
        if (job.narrative && sourceInput.includes(job.narrative.substring(0, 20))) {
            updateData.narrative = resultText;
        } else {
            updateData.shieldOutput = resultText;
        }
        await prisma.job.update({ where: { id: jobId }, data: updateData });
      }

      // =========================================================
      // CASE 5: PPT下書き
      // =========================================================
      else if (action === 'PPT') {
         const sourceText = job.transcript || job.rawText || "";
         const prompt = `PowerPoint用のスライド構成案（5-8枚）をMarkdownで作成してください。\n\n${sourceText.substring(0, 100000)}`;
         resultText = await generateWithRetry(model, { contents: [{ role: 'user', parts: [{ text: prompt }] }] }, "PPT");
         
         await prisma.job.update({ where: { id: jobId }, data: { pptOutput: resultText, status: JobStatus.COMPLETED } });
      }

      console.log(`[AI] ✅ Job ${jobId} Completed (Length: ${resultText.length})`);

    } catch (error) {
      console.error(`[AI] ❌ Processing FAILED:`, error);
      await prisma.job.update({
        where: { id: jobId },
        data: { status: JobStatus.FAILED, errorMessage: error instanceof Error ? error.message : 'Unknown error' }
      });
      throw error;
    }
  }
};