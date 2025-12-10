'use server'

import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';

export async function createAudioJob(gcsPath: string, fileName: string, mimeType: string) {
  const session = await auth();

  // 1. ID存在チェック (これでsession.user.idがstring型確定)
  if (!session?.user?.id) {
    throw new Error('Unauthorized: No user ID found');
  }

  try {
    const newJob = await prisma.job.create({
      data: {
        // ▼ 修正: userId だけ指定すればOKです（connectは削除）
       userId: session.user.id,
        
        fileName: fileName,
        sourceUrl: `gs://${process.env.GCS_BUCKET_NAME}/${gcsPath}`,
        
        
   　 // ▼▼▼ 修正点: "as const" を付けるか、型アサーションを使います ▼▼▼
        inputType: "AUDIO" as const, 
        status: 'UPLOADED' as const,
        mode: 'NORMAL' as const,
        // ▲▲▲ これで赤線が消えるはずです ▲▲▲
        
        // 必須フィールドの初期化 (全て埋める)
        rawText: null,
        durationSec: 0,
        transcript: null,
        summaryReport: null,
        summary: null, 

        
        // 他のオプショナルフィールドも念のためnull埋め
        narrative: null,
        risks: null,
        score: null,
        slideUrl: null,
        errorMessage: null,
        reporterName: null,
        targetName: null,
        docType: null,
        
        // リレーションID
        projectId: null,
      },
    });

    revalidatePath('/dashboard'); 
    return { success: true, jobId: newJob.id };

  } catch (error) {
    console.error('Job Creation Error:', error);
    return { success: false, error: 'Failed to create job' };
  }
}