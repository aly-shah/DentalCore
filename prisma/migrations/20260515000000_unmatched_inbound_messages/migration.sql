-- CreateEnum
CREATE TYPE "UnmatchedInboundStatus" AS ENUM ('UNMATCHED', 'MATCHED', 'DISMISSED');

-- CreateTable
CREATE TABLE "UnmatchedInboundMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "externalId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'WHATSAPP',
    "fromPhone" TEXT NOT NULL,
    "fromName" TEXT,
    "content" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "UnmatchedInboundStatus" NOT NULL DEFAULT 'UNMATCHED',
    "matchedPatientId" TEXT,
    "matchedByUserId" TEXT,
    "matchedAt" TIMESTAMP(3),
    "dismissedByUserId" TEXT,
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnmatchedInboundMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UnmatchedInboundMessage_externalId_key" ON "UnmatchedInboundMessage"("externalId");

-- CreateIndex
CREATE INDEX "UnmatchedInboundMessage_tenantId_status_receivedAt_idx" ON "UnmatchedInboundMessage"("tenantId", "status", "receivedAt");

-- CreateIndex
CREATE INDEX "UnmatchedInboundMessage_fromPhone_idx" ON "UnmatchedInboundMessage"("fromPhone");

-- CreateIndex
CREATE INDEX "UnmatchedInboundMessage_status_idx" ON "UnmatchedInboundMessage"("status");
