ALTER TABLE "Listing" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "Listing" SET "updatedAt"="createdAt";
ALTER TABLE "Store" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "Store" SET "updatedAt"="createdAt";
ALTER TABLE "Notification" ADD COLUMN "eventKey" TEXT;
CREATE UNIQUE INDEX "Notification_eventKey_key" ON "Notification"("eventKey");
CREATE TABLE "BackgroundJob" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "dedupKey" TEXT,
 "kind" TEXT NOT NULL,
 "payload" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PENDING',
 "attempts" INTEGER NOT NULL DEFAULT 0,
 "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "lockedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "BackgroundJob_dedupKey_key" ON "BackgroundJob"("dedupKey");
CREATE INDEX "BackgroundJob_status_availableAt_idx" ON "BackgroundJob"("status","availableAt");
CREATE TABLE "OperationalCheck" (
 "key" TEXT NOT NULL PRIMARY KEY,
 "lastSuccessAt" TIMESTAMP(3),
 "lastFailureAt" TIMESTAMP(3)
);
