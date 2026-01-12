/*
  Warnings:

  - The values [NORMAL,STEALTH] on the enum `SecurityMode` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `docDate` on the `Job` table. All the data in the column will be lost.
  - You are about to drop the column `reporterName` on the `Job` table. All the data in the column will be lost.
  - The `plan` column on the `User` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "UserPlan" AS ENUM ('FREE', 'PRO', 'ADMIN');

-- AlterEnum
ALTER TYPE "JobType" ADD VALUE 'VIDEO';

-- AlterEnum
BEGIN;
CREATE TYPE "SecurityMode_new" AS ENUM ('CONFIDENTIAL', 'ANONYMOUS');
ALTER TABLE "Job" ALTER COLUMN "security" DROP DEFAULT;
ALTER TABLE "Job" ALTER COLUMN "security" TYPE "SecurityMode_new" USING ("security"::text::"SecurityMode_new");
ALTER TYPE "SecurityMode" RENAME TO "SecurityMode_old";
ALTER TYPE "SecurityMode_new" RENAME TO "SecurityMode";
DROP TYPE "SecurityMode_old";
ALTER TABLE "Job" ALTER COLUMN "security" SET DEFAULT 'CONFIDENTIAL';
COMMIT;

-- DropForeignKey
ALTER TABLE "Job" DROP CONSTRAINT "Job_userId_fkey";

-- AlterTable
ALTER TABLE "Job" DROP COLUMN "docDate",
DROP COLUMN "reporterName",
ADD COLUMN     "metrics" JSONB,
ADD COLUMN     "pptOutput" TEXT,
ADD COLUMN     "tags" TEXT,
ADD COLUMN     "translation" TEXT,
ADD COLUMN     "translations" JSONB,
ALTER COLUMN "userId" DROP NOT NULL,
ALTER COLUMN "security" SET DEFAULT 'CONFIDENTIAL';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerified" TIMESTAMP(3),
ADD COLUMN     "image" TEXT,
DROP COLUMN "plan",
ADD COLUMN     "plan" "UserPlan" NOT NULL DEFAULT 'FREE';

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
