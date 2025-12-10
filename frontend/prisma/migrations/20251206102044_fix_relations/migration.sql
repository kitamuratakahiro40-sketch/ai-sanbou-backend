-- AlterEnum
ALTER TYPE "JobStatus" ADD VALUE 'pending';

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "audioUrl" TEXT,
ADD COLUMN     "summary" TEXT;
