import { VertexAI } from '@google-cloud/vertexai';
import { PrismaClient, JobStatus, InputType } from '@prisma/client';

const prisma = new PrismaClient();

const MODEL_NAME = 'gemini-2.5-pro'; 
const PROJECT_ID = process.env.PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || 'sanbou-ai-project';
const LOCATION = 'us-central1';

// ★削除: ここで初期化すると環境変数エラーの原因になる
// const vertexAI = new VertexAI({ ... });

export const geminiProcessor = {
  async processJob(jobId: string) {
    console.log(`[AI] 🚀 Processing job: ${jobId}`);
    
    try {
      // ★追加: 実行直前に環境変数を掃除して初期化（エラー回避の鉄板パターン）
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS === "") {
        delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
      }
      const vertexAI = new VertexAI({ project: PROJECT_ID, location: LOCATION });
      const model = vertexAI.getGenerativeModel({ 
        model: MODEL_NAME,
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 8192,
        }
      });

      // 1. ジョブ取得とステータス更新
      const job = await prisma.job.findUnique({ where: { id: jobId } });
      if (!job) throw new Error('Job not found');

      await prisma.job.update({
        where: { id: jobId },
        data: { status: JobStatus.PROCESSING }
      });

      let targetText = job.rawText || "";

      // ■ Pipeline A: AUDIO Processing
      if (job.inputType === InputType.AUDIO) {
        if (!job.sourceUrl) throw new Error('Source URL is missing for Audio job');
        console.log(`[AI] 🎙️ Transcribing audio: ${job.sourceUrl}`);

        const transcriptionResult = await model.generateContent({
          contents: [{
            role: 'user',
            parts: [
              { fileData: { mimeType: 'audio/mp3', fileUri: job.sourceUrl } },
              { text: `
                あなたはAI書記官です。音声ファイルを文字起こししてください。
                【重要: 話者分離タグ】
                発言者が変わるたびに、必ず \`[Speaker A]\`, \`[Speaker B]\` のようなタグを冒頭につけてください。
                このタグは後で人物名に置換するため、絶対に省略しないでください。
              ` }
            ]
          }]
        });

        const transcript = transcriptionResult.response.candidates?.[0].content.parts[0].text || "";
        targetText = transcript;
        
        await prisma.job.update({
          where: { id: jobId },
          data: { transcript: transcript, rawText: transcript }
        });
      }

      // ■ Pipeline B: TEXT Analysis
      if (!targetText) throw new Error("No text content to analyze.");
      console.log(`[AI] 🧠 Analyzing content...`);

      // Task 1: JSON Analysis
      const analysisPrompt = `
        あなたはビジネス参謀です。以下のテキストを分析し、JSONのみを出力してください。
        Markdownコードブロックは不要です。

        【出力フォーマット】
        {
          "metadata": { "reporter_name": "...", "target_name": "...", "doc_type": "..." },
          "shield_content": { "good_news": "...", "bad_news": "...", "next_actions": "..." },
          "spear_actions": [ { "who": "...", "what": "...", "due": "..." } ]
        }
        
        【テキスト】
        ${targetText.substring(0, 25000)}
      `;

      // Task 2: Narrative Generation
      // ★修正: タグを残すように強く指示
      const narrativePrompt = `
        あなたは歴史家です。以下のテキストを元に、物語形式の記録を作成してください。
        
        【最重要ルール: タグの維持】
        原文にある \`[Speaker A]\` などの話者タグは、**そのまま物語の中に残してください**。
        (例: "[Speaker A]は、懸念を示しながら立ち上がった。")
        これにより、後からシステムがタグを人物名に置換できるようにします。

        【テキスト】
        ${targetText.substring(0, 25000)}
      `;

      const [analysisResult, narrativeResult] = await Promise.all([
        model.generateContent(analysisPrompt),
        model.generateContent(narrativePrompt)
      ]);

      const narrativeText = narrativeResult.response.candidates?.[0].content.parts[0].text || "";
      const analysisRaw = analysisResult.response.candidates?.[0].content.parts[0].text || "{}";
      const cleanJson = analysisRaw.replace(/```json/g, '').replace(/```/g, '').trim();
      
      let parsedData;
      try {
        parsedData = JSON.parse(cleanJson);
      } catch (e) {
        parsedData = { metadata: {}, shield_content: {}, spear_actions: [] };
      }

      const summaryMarkdown = `
## 🟢 Good News
${parsedData.shield_content?.good_news || '-'}
## 🔴 Bad News
${parsedData.shield_content?.bad_news || '-'}
## 🚀 Actions
${parsedData.shield_content?.next_actions || '-'}
      `;

      // Save Results
      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: JobStatus.COMPLETED,
          reporterName: parsedData.metadata?.reporter_name || null,
          targetName: parsedData.metadata?.target_name || null,
          docType: parsedData.metadata?.doc_type || null,
          narrative: narrativeText,
          summaryReport: summaryMarkdown,
          summaryActionJson: parsedData.spear_actions || [],
        }
      });

      console.log(`[AI] ✅ Job ${jobId} COMPLETED successfully.`);

    } catch (error) {
      console.error(`[AI] ❌ Job ${jobId} FAILED:`, error);
      await prisma.job.update({
        where: { id: jobId },
        data: { 
          status: JobStatus.FAILED,
          errorMessage: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  }
};