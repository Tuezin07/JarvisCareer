-- CreateEnum
CREATE TYPE "JobProvider" AS ENUM ('GREENHOUSE', 'LEVER', 'ASHBY');

-- CreateEnum
CREATE TYPE "JobSourceStatus" AS ENUM ('ACTIVE', 'FAILING', 'DISABLED');

-- CreateEnum
CREATE TYPE "WorkplaceType" AS ENUM ('REMOTE', 'HYBRID', 'ONSITE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "FraudRisk" AS ENUM ('LOW', 'MODERATE', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "JobMatchStatus" AS ENUM ('NEW', 'SAVED', 'DISMISSED');

-- AlterTable
ALTER TABLE "CandidatePreferences" ADD COLUMN     "matchWeights" JSONB;

-- CreateTable
CREATE TABLE "JobSource" (
    "id" UUID NOT NULL,
    "provider" "JobProvider" NOT NULL,
    "boardToken" TEXT NOT NULL,
    "region" TEXT,
    "companyName" TEXT NOT NULL,
    "careersUrl" TEXT NOT NULL,
    "status" "JobSourceStatus" NOT NULL DEFAULT 'ACTIVE',
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "openJobCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserJobSource" (
    "userId" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserJobSource_pkey" PRIMARY KEY ("userId","sourceId")
);

-- CreateTable
CREATE TABLE "JobListing" (
    "id" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "department" TEXT,
    "locations" TEXT[],
    "workplaceType" "WorkplaceType" NOT NULL DEFAULT 'UNKNOWN',
    "employmentType" TEXT,
    "description" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "applyUrl" TEXT,
    "language" TEXT,
    "salaryMin" INTEGER,
    "salaryMax" INTEGER,
    "salaryCurrency" TEXT,
    "salaryPeriod" TEXT,
    "publishedAt" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "contentHash" CHAR(64) NOT NULL,
    "dedupKey" TEXT NOT NULL,
    "fraudRisk" "FraudRisk" NOT NULL DEFAULT 'LOW',
    "fraudSignals" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "JobListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobMatch" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "score" INTEGER NOT NULL,
    "eliminated" BOOLEAN NOT NULL DEFAULT false,
    "breakdown" JSONB NOT NULL,
    "status" "JobMatchStatus" NOT NULL DEFAULT 'NEW',
    "listingHash" CHAR(64) NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobMatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobSource_provider_boardToken_key" ON "JobSource"("provider", "boardToken");

-- CreateIndex
CREATE INDEX "UserJobSource_sourceId_idx" ON "UserJobSource"("sourceId");

-- CreateIndex
CREATE INDEX "JobListing_dedupKey_idx" ON "JobListing"("dedupKey");

-- CreateIndex
CREATE INDEX "JobListing_sourceId_closedAt_idx" ON "JobListing"("sourceId", "closedAt");

-- CreateIndex
CREATE UNIQUE INDEX "JobListing_sourceId_externalId_key" ON "JobListing"("sourceId", "externalId");

-- CreateIndex
CREATE INDEX "JobMatch_userId_eliminated_score_idx" ON "JobMatch"("userId", "eliminated", "score");

-- CreateIndex
CREATE UNIQUE INDEX "JobMatch_userId_listingId_key" ON "JobMatch"("userId", "listingId");

-- AddForeignKey
ALTER TABLE "UserJobSource" ADD CONSTRAINT "UserJobSource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserJobSource" ADD CONSTRAINT "UserJobSource_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "JobSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobListing" ADD CONSTRAINT "JobListing_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "JobSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobMatch" ADD CONSTRAINT "JobMatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobMatch" ADD CONSTRAINT "JobMatch_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "JobListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
