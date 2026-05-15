-- AlterTable
ALTER TABLE "CommunicationLog"
  ADD COLUMN "mediaUrl" TEXT,
  ADD COLUMN "mediaMimeType" TEXT;

-- AlterTable
ALTER TABLE "UnmatchedInboundMessage"
  ADD COLUMN "mediaUrl" TEXT,
  ADD COLUMN "mediaMimeType" TEXT;
