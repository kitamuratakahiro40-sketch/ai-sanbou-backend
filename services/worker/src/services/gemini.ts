import 'dotenv/config';
import { VertexAI } from '@google-cloud/vertexai';
import { PrismaClient, JobStatus } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { Storage } from '@google-cloud/storage';
import { setGlobalDispatcher, Agent } from 'undici';

setGlobalDispatcher(new Agent({
  connect: { timeout: 60_000 },
  bodyTimeout: 0,
  headersTimeout: 1200_000 // 20分
}));

const prisma = new PrismaClient();
const storage = new Storage();

// =========================================================
// 🤖 モデル設定 (Gemini 3 Hybrid Strategy)
// =========================================================
const MODEL_FLASH = 'gemini-3-flash-preview';
const MODEL_PRO = 'gemini-3-pro-preview';

// 共通設定
const PROJECT_ID = process.env.PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || 'sanbou-ai-project';
const LOCATION = 'global'; 

// リトライ関数（変更なし）
async function generateWithRetry(model: any, request: any, label: string) {
  const maxRetries = 3;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const streamingResp = await model.generateContentStream(request);
      let fullText = '';
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
    
    // アクションに応じたモデル選択
    // ★微調整: タイ語要約時は速度重視ならFlashでも良いですが、精度重視でProのままにします（変更なし）
    const selectedModelName = (action === 'TRANSCRIBE') ? MODEL_FLASH : MODEL_PRO;
    
    console.log(`[AI] 🚀 Processing job: ${jobId} / Action: ${action} / Model: ${selectedModelName}`);

    try {
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS === "") delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

      const vertexAI = new VertexAI({
        project: PROJECT_ID,
        location: LOCATION,
        apiEndpoint: 'aiplatform.googleapis.com'
      });

      const model = vertexAI.getGenerativeModel({
        model: selectedModelName,
        generationConfig: {
          temperature: 1.0, // 推論モデル推奨値
          maxOutputTokens: 65536,
          topP: 0.8,
          topK: 40
        }
      });

      const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
      await prisma.job.update({ where: { id: jobId }, data: { status: JobStatus.PROCESSING } });

      let resultText = "";

      // ファイル準備
      let filePart = undefined;
      if (job.sourceUrl && action === 'TRANSCRIBE') {
        if (job.sourceUrl.startsWith('gs://')) {
          filePart = {
            fileData: {
              mimeType: (job as any).mimeType || 'audio/mp3', 
              fileUri: job.sourceUrl
            }
          };
          console.log(`[AI] 🎙️ Transcribing with ${selectedModelName}...`);
        }
      }

      // =========================================================
      // CASE 1: 文字起こし (Flash) - 正確性・網羅性重視
      // =========================================================
      if (action === 'TRANSCRIBE') {
        const prompt = `
役割：法廷速記官
タスク：提供された音声データの「完全な逐語録」を作成せよ。

【厳守事項】
1. **完全網羅**: 要約は厳禁。発言を一言一句漏らさず記述すること。
2. **フィラー削除**: 「えー」「あー」等の無意味な音のみ削除せよ。
3. **話者分離**: [Speaker A], [Speaker B] の形式で記述せよ。
4. **形式**: 装飾や前置きは不要。文字起こしテキストのみを出力せよ。
`;
        if (filePart) {
             resultText = await generateWithRetry(model, {
                contents: [{ role: 'user', parts: [filePart, { text: prompt }] }]
            }, "Transcription");

            await prisma.job.update({ 
                where: { id: jobId }, 
                data: { transcript: resultText, status: JobStatus.COMPLETED } 
            });
        }
      }

      // =========================================================
      // CASE 2: ナラティブ要約 (Pro) - 冗長性・表現力重視
      // =========================================================
      else if (action === 'NARRATIVE') {
        const source = job.transcript || job.rawText || "";
        const prompt = `
役割：ベストセラー作家
タスク：以下の議事録を、会議の熱量や空気感を追体験できる「没入型ナラティブ（物語）」として再構成せよ。

【執筆ルール】
1. **スタイル**: 冗長で表現豊かな文体を使用せよ。簡潔な要約は禁止する。
2. **構成**: 箇条書きは絶対に使用せず、全て「段落（パラグラフ）」で記述せよ。
3. **描写**: 「A氏は机を叩く勢いで主張した」のように、感情や対立構造をドラマチックに描写せよ。
4. **引用**: 重要な発言は「 」を用いて直接引用として組み込め。

【対象テキスト】
${source.substring(0, 100000)}
`;
        console.log(`[AI] 📖 Generating Narrative with Pro...`);
        resultText = await generateWithRetry(model, { contents: [{ role: 'user', parts: [{ text: prompt }] }] }, "Narrative");
        
        await prisma.job.update({ 
            where: { id: jobId }, 
            data: { narrative: resultText, status: JobStatus.COMPLETED } 
        });
      }

      // =========================================================
      // CASE 3: ビジネス議事録 (Pro) - 構造化・効率重視
      // ★ここにタイ語モード (TH-TH) の分岐を追加
      // =========================================================
      else if (action === 'BUSINESS') {
        const source = job.transcript || job.rawText || "";
        let prompt = "";

        // 🇹🇭 タイ語モードかどうか判定
        if (options.isThaiMode) {
            console.log(`[AI] 🇹🇭 Generating Thai Summary (TH-TH) with Pro...`);
            prompt = `
Role: You are a capable Thai Chief of Staff (参謀).
Objective: Summarize the provided meeting notes/text into Thai.
Target Audience: Junior Thai staff members (Explain in simple, accurate, and professional Thai).

Output Structure:
1. **สรุปประเด็นสำคัญ (Key Points)**: Use bullet points.
2. **สิ่งที่ต้องดำเนินการ (Action Items)**: List specific tasks.

Constraint: Ensure the output is strictly in Thai Language.

【Target Text】
${source.substring(0, 100000)}
`;
        } else {
            // 🇯🇵 通常の日本語ビジネス議事録
            console.log(`[AI] 🛡️ Generating Business Minutes with Pro...`);
            prompt = `
タスク：以下の会議内容から、Markdown形式のビジネス議事録を作成せよ。

【出力フォーマット】
# 会議議事録

## 1. 決定事項
* （決定された内容を具体的に）

## 2. ネクストアクション
* （誰が・いつまでに・何をするか）

## 3. 議論の要点
* （主要な論点と結論へのプロセス）

## 4. 懸念点・リスク
* （残された課題やリスク要因）

【対象テキスト】
${source.substring(0, 100000)}
`;
        }

        resultText = await generateWithRetry(model, { contents: [{ role: 'user', parts: [{ text: prompt }] }] }, "Business");
        
        // タイ語モードでもDB上は shieldOutput に格納（UI側でそのまま表示できるため）
        const metrics = { transparency: 95, passion: 90, risk: 5 };
        await prisma.job.update({ 
            where: { id: jobId }, 
            data: { shieldOutput: resultText, metrics: metrics, status: JobStatus.COMPLETED } 
        });
      }

      // =========================================================
      // CASE 4: 翻訳 (Pro) - 議事録＆PPT下書き対応
      // =========================================================
      else if (action === 'TRANSLATE') {
        const targetLang = options.targetLang || 'Japanese';
        // ソースの切り替え (NARRATIVE, BUSINESS, PPT_DRAFT)
        const sourceKey = options.sourceKey || 'NARRATIVE'; 
        
        let sourceText = "";
        let isPPTMode = false;

        // ▼ ソーステキストの取得ロジック
        if (sourceKey === 'BUSINESS') {
          sourceText = job.shieldOutput || "";
        } else if (sourceKey === 'PPT_DRAFT') {
          // ★ PPT下書き翻訳モード
          sourceText = job.pptOutput || ""; 
          isPPTMode = true;
        } else {
          sourceText = job.narrative || job.transcript || ""; 
        }

        // ▼ プロンプトの切り替え (PPT用はMarkdown維持を強調)
        let prompt = "";
        if (isPPTMode) {
          prompt = `
Task: Translate the following Presentation Draft (Markdown) into ${targetLang}.
Constraints:
1. Keep the Markdown structure (headers, bullet points, bold text) strictly unchanged.
2. Translate the content to be natural and professional for business context.
3. **If target is Thai, use polite business Thai.**
4. **If target is English, use standard business English.**
5. Output ONLY the translated Markdown text.

[Source Markdown]
${sourceText.substring(0, 30000)}`;
        } else {
          prompt = `Translate the following text to ${targetLang}. Keep Markdown format. Output only the translated text.\n\n${sourceText.substring(0, 30000)}`;
        }
        
        console.log(`[AI] 🌐 Translating ${sourceKey} to ${targetLang}...`);
        resultText = await generateWithRetry(model, { contents: [{ role: 'user', parts: [{ text: prompt }] }] }, "Translate");

        // ▼ 保存処理の分岐
        if (isPPTMode) {
            // PPTモードなら、下書き(pptOutput)を直接上書き更新する
            await prisma.job.update({ 
                where: { id: jobId }, 
                data: { 
                  pptOutput: resultText, // 画面更新用
                  status: JobStatus.COMPLETED 
                } 
            });
        } else {
            // 通常モードなら、translations JSONにマージ保存
            const currentTranslations = (job.translations as any) || {};
            const newKey = `${targetLang}_${sourceKey}`; 
            
            const updatedTranslations = {
              ...currentTranslations,
              [newKey]: resultText
            };
    
            await prisma.job.update({ 
                where: { id: jobId }, 
                data: { 
                  translations: updatedTranslations,
                  status: JobStatus.COMPLETED 
                } 
            });
        }
      }

      // =========================================================
      // CASE 5: PPT下書き (Pro) - 構成力重視
      // =========================================================
      else if (action === 'PPT') {
         const sourceText = job.transcript || job.rawText || "";

         // ★言語設定（デフォルトは日本語に戻しました）
         // フロントから指定があれば従いますが、基本は日本語で作ります
         const targetLang = job.targetLang || "Japanese"; 

         let langInstruction = "";
         if (targetLang === "Thai") {
             langInstruction = "出力言語：必ず【タイ語 (Thai)】で記述すること。";
         } else if (targetLang === "English") {
             langInstruction = "Output Language: Must be in English.";
         } else {
             langInstruction = "出力言語：日本語";
         }

         // 文字数による制御ロジック（そのまま維持）
         const textLength = sourceText.length;
         
         let slideCountGuide = "5〜8枚";
         let styleGuide = "聴衆を説得するための論理的なストーリーラインを作ること。";

         if (textLength < 400) {
             slideCountGuide = "1〜2枚（無理に話を膨らませず、要点のみを簡潔にまとめる）";
             styleGuide = "情報量が少ないため、事実ベースの「速報・メモ」形式に留めること。過度な創作や推測による補完は行わないこと。";
         }

         const prompt = `
タスク：会議内容を元に、プレゼンテーション用スライド構成案を作成せよ。
出力形式：Markdown
**${langInstruction}**

【構成要件】
* スライド枚数：${slideCountGuide}
* 各スライドは「タイトル」と「3〜5個の箇条書きポイント」で構成せよ。
* スタイル指示：${styleGuide}

【対象テキスト】
${sourceText.substring(0, 100000)}`;

         console.log(`[AI] 📊 Generating PPT Draft with Pro... (Length: ${textLength}, Target: ${slideCountGuide})`);
         
         resultText = await generateWithRetry(model, { contents: [{ role: 'user', parts: [{ text: prompt }] }] }, "PPT");
         
         await prisma.job.update({ 
            where: { id: jobId }, 
            data: { pptOutput: resultText, status: JobStatus.COMPLETED } 
         });
      }

      console.log(`[AI] ✅ Job ${jobId} Action ${action} Completed.`);

    } catch (error: any) {
      console.error(`[AI] ❌ Processing FAILED:`, error);
      await prisma.job.update({
        where: { id: jobId },
        data: { status: JobStatus.FAILED, errorMessage: error.message || 'Unknown error' }
      });
      throw error;
    }
  }
};