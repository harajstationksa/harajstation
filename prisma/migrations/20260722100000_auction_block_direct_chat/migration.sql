-- AlterTable: a conversation may exist without a listing (direct profile chat)
ALTER TABLE "Conversation" ALTER COLUMN "listingId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "AuctionBlock" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuctionBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuctionBlock_auctionId_userId_key" ON "AuctionBlock"("auctionId", "userId");

-- AddForeignKey
ALTER TABLE "AuctionBlock" ADD CONSTRAINT "AuctionBlock_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionBlock" ADD CONSTRAINT "AuctionBlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
