ALTER TABLE "Listing"
  ADD COLUMN "riskLevel" TEXT NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN "riskReasons" TEXT NOT NULL DEFAULT '[]',
  ADD COLUMN "riskSignals" TEXT NOT NULL DEFAULT '[]',
  ADD COLUMN "requestMessage" TEXT,
  ADD COLUMN "reviewedBy" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3);

CREATE INDEX "Listing_status_riskLevel_createdAt_idx"
  ON "Listing"("status", "riskLevel", "createdAt");

ALTER TABLE "Auction" ADD COLUMN "reviewRemainingMs" INTEGER;
ALTER TABLE "Campaign" ADD COLUMN "reviewPausedAt" TIMESTAMP(3);
