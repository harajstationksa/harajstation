-- AlterTable
ALTER TABLE "Bid" ADD COLUMN     "anonymous" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ProxyBid" ADD COLUMN     "anonymous" BOOLEAN NOT NULL DEFAULT false;
