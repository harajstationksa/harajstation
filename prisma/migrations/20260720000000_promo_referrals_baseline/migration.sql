-- Baseline migration: these objects were created on dev and production with
-- `prisma db push` (promo codes / referrals / message delivery receipts) and
-- never got a migration. Both existing databases have been marked as already
-- applied via `prisma migrate resolve --applied`; this file only executes on
-- fresh databases.

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "deliveredAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "promoBonus" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "promoCodeId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "referralCode" TEXT,
ADD COLUMN     "referredById" TEXT;

-- CreateTable
CREATE TABLE "ReferralEarning" (
    "id" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "referredId" TEXT NOT NULL,
    "paymentId" TEXT,
    "points" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralEarning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "percent" INTEGER NOT NULL,
    "maxUses" INTEGER NOT NULL DEFAULT 0,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "oncePerUser" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoRedemption" (
    "id" TEXT NOT NULL,
    "promoId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "paymentId" TEXT,
    "bonusPoints" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReferralEarning_referrerId_createdAt_idx" ON "ReferralEarning"("referrerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PromoCode_code_key" ON "PromoCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PromoRedemption_paymentId_key" ON "PromoRedemption"("paymentId");

-- CreateIndex
CREATE INDEX "PromoRedemption_promoId_idx" ON "PromoRedemption"("promoId");

-- CreateIndex
CREATE INDEX "PromoRedemption_userId_idx" ON "PromoRedemption"("userId");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralEarning" ADD CONSTRAINT "ReferralEarning_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralEarning" ADD CONSTRAINT "ReferralEarning_referredId_fkey" FOREIGN KEY ("referredId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoRedemption" ADD CONSTRAINT "PromoRedemption_promoId_fkey" FOREIGN KEY ("promoId") REFERENCES "PromoCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoRedemption" ADD CONSTRAINT "PromoRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
