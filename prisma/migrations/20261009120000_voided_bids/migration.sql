-- Archive for bids withdrawn from live auctions (seller block / account ban).
CREATE TABLE "VoidedBid" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "bidderId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "maskedName" TEXT NOT NULL,
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "bidAt" TIMESTAMP(3) NOT NULL,
    "voidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedById" TEXT,
    "reason" TEXT NOT NULL,

    CONSTRAINT "VoidedBid_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VoidedBid_auctionId_idx" ON "VoidedBid"("auctionId");
CREATE INDEX "VoidedBid_bidderId_idx" ON "VoidedBid"("bidderId");
