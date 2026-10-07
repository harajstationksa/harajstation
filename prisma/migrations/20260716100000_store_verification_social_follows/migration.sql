-- AlterTable
ALTER TABLE "Store" ADD COLUMN "isVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "website" TEXT,
ADD COLUMN "twitter" TEXT,
ADD COLUMN "instagram" TEXT,
ADD COLUMN "tiktok" TEXT,
ADD COLUMN "snapchat" TEXT,
ADD COLUMN "youtube" TEXT,
ADD COLUMN "whatsapp" TEXT;

-- CreateTable
CREATE TABLE "StoreVerification" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "docPath" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "StoreVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreFollow" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreFollow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoreVerification_storeId_key" ON "StoreVerification"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "StoreFollow_storeId_userId_key" ON "StoreFollow"("storeId", "userId");

-- CreateIndex
CREATE INDEX "StoreFollow_storeId_idx" ON "StoreFollow"("storeId");

-- CreateIndex
CREATE INDEX "StoreFollow_userId_idx" ON "StoreFollow"("userId");

-- AddForeignKey
ALTER TABLE "StoreVerification" ADD CONSTRAINT "StoreVerification_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreFollow" ADD CONSTRAINT "StoreFollow_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreFollow" ADD CONSTRAINT "StoreFollow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
