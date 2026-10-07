-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "extAskedAt" TIMESTAMP(3),
ADD COLUMN     "extDays" INTEGER,
ADD COLUMN     "extNote" TEXT,
ADD COLUMN     "extStatus" TEXT;
