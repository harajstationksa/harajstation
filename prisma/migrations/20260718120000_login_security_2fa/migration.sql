-- AlterTable
ALTER TABLE "User" ADD COLUMN "failedLogins" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastFailedAt" TIMESTAMP(3),
ADD COLUMN "lockUntil" TIMESTAMP(3),
ADD COLUMN "twoFactorEmail" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "LoginOtp" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "challenge" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginOtp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LoginOtp_challenge_key" ON "LoginOtp"("challenge");

-- CreateIndex
CREATE INDEX "LoginOtp_userId_idx" ON "LoginOtp"("userId");

-- AddForeignKey
ALTER TABLE "LoginOtp" ADD CONSTRAINT "LoginOtp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
