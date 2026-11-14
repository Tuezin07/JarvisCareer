-- CreateEnum
CREATE TYPE "BrowserTaskKind" AS ENUM ('INSPECT_PAGE', 'FILL_TEST_FORM');

-- CreateEnum
CREATE TYPE "BrowserSessionStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'WAITING_HUMAN', 'CANCELLED', 'BLOCKED');

-- CreateTable
CREATE TABLE "BrowserSession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" "BrowserTaskKind" NOT NULL,
    "status" "BrowserSessionStatus" NOT NULL DEFAULT 'QUEUED',
    "targetUrl" TEXT NOT NULL,
    "finalUrl" TEXT,
    "title" TEXT,
    "listingId" UUID,
    "executor" TEXT NOT NULL DEFAULT 'playwright',
    "provider" TEXT,
    "result" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "BrowserSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionEvidence" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'SCREENSHOT',
    "label" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActionEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BrowserSession_userId_createdAt_idx" ON "BrowserSession"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "BrowserSession_userId_status_idx" ON "BrowserSession"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ActionEvidence_storageKey_key" ON "ActionEvidence"("storageKey");

-- CreateIndex
CREATE INDEX "ActionEvidence_userId_expiresAt_idx" ON "ActionEvidence"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "ActionEvidence_sessionId_idx" ON "ActionEvidence"("sessionId");

-- AddForeignKey
ALTER TABLE "BrowserSession" ADD CONSTRAINT "BrowserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionEvidence" ADD CONSTRAINT "ActionEvidence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionEvidence" ADD CONSTRAINT "ActionEvidence_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "BrowserSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
