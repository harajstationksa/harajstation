-- AlterTable: seller responsiveness aggregates
ALTER TABLE "User" ADD COLUMN "responseMinsSum" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "responseCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: bump position + one-shot price-drop nudge marker
ALTER TABLE "Listing" ADD COLUMN "bumpedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "priceNudgeAt" TIMESTAMP(3);

-- Backfill: existing listings keep their publication order (bumpedAt = createdAt)
UPDATE "Listing" SET "bumpedAt" = "createdAt";

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "counterAmount" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Offer_listingId_status_idx" ON "Offer"("listingId", "status");

-- CreateIndex
CREATE INDEX "Offer_buyerId_createdAt_idx" ON "Offer"("buyerId", "createdAt");

-- CreateIndex
CREATE INDEX "Listing_status_bumpedAt_idx" ON "Listing"("status", "bumpedAt");

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
