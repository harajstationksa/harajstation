BEGIN;
ALTER TABLE "Conversation" ADD COLUMN "directKey" TEXT, ADD COLUMN "firstSellerReplyAt" TIMESTAMP(3);
CREATE TEMP TABLE audit_direct_merge ON COMMIT DROP AS
SELECT id, first_value(id) OVER (
  PARTITION BY LEAST("buyerId" COLLATE "C", "sellerId" COLLATE "C"), GREATEST("buyerId" COLLATE "C", "sellerId" COLLATE "C")
  ORDER BY "createdAt", id
) AS keep_id FROM "Conversation" WHERE "listingId" IS NULL;
UPDATE "Message" m SET "conversationId" = p.keep_id FROM audit_direct_merge p WHERE m."conversationId" = p.id AND p.id <> p.keep_id;
UPDATE "Notification" n SET link = '/dashboard/messages/' || p.keep_id FROM audit_direct_merge p WHERE n.link = '/dashboard/messages/' || p.id AND p.id <> p.keep_id;
DELETE FROM "Conversation" c USING audit_direct_merge p WHERE c.id = p.id AND p.id <> p.keep_id;
UPDATE "Conversation" SET "directKey" =
  length(LEAST("buyerId" COLLATE "C", "sellerId" COLLATE "C"))::text || ':' || LEAST("buyerId" COLLATE "C", "sellerId" COLLATE "C") ||
  length(GREATEST("buyerId" COLLATE "C", "sellerId" COLLATE "C"))::text || ':' || GREATEST("buyerId" COLLATE "C", "sellerId" COLLATE "C")
WHERE "listingId" IS NULL;
UPDATE "Conversation" c SET "firstSellerReplyAt" = (SELECT MIN(m."createdAt") FROM "Message" m WHERE m."conversationId" = c.id AND m."senderId" = c."sellerId");
CREATE UNIQUE INDEX "Conversation_directKey_key" ON "Conversation"("directKey");
CREATE UNIQUE INDEX "Conversation_direct_pair_key" ON "Conversation"(LEAST("buyerId" COLLATE "C", "sellerId" COLLATE "C"), GREATEST("buyerId" COLLATE "C", "sellerId" COLLATE "C")) WHERE "listingId" IS NULL;
CREATE TABLE "UserBlock" (
  id TEXT NOT NULL PRIMARY KEY, "blockerId" TEXT NOT NULL, "blockedId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserBlock_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "UserBlock_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "UserBlock_no_self" CHECK ("blockerId" <> "blockedId")
);
CREATE UNIQUE INDEX "UserBlock_blockerId_blockedId_key" ON "UserBlock"("blockerId", "blockedId");
CREATE INDEX "UserBlock_blockedId_idx" ON "UserBlock"("blockedId");
CREATE TABLE "OperationalLease" (key TEXT NOT NULL PRIMARY KEY, owner TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL);
CREATE INDEX "Listing_sellerId_status_idx" ON "Listing"("sellerId",status);
CREATE INDEX "Conversation_buyerId_idx" ON "Conversation"("buyerId");
CREATE INDEX "Conversation_sellerId_idx" ON "Conversation"("sellerId");
CREATE INDEX "Bid_bidderId_idx" ON "Bid"("bidderId");
CREATE INDEX "Transaction_buyerId_idx" ON "Transaction"("buyerId");
CREATE INDEX "Transaction_sellerId_idx" ON "Transaction"("sellerId");
CREATE INDEX "Message_senderId_idx" ON "Message"("senderId");
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId","createdAt");
ALTER TABLE "Review" ADD CONSTRAINT "Review_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"(id) ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "Review" VALIDATE CONSTRAINT "Review_transactionId_fkey";
ALTER TABLE "Dispute" DROP CONSTRAINT "Dispute_transactionId_fkey";
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_role_check" CHECK (role IN ('USER','ADMIN','MODERATOR','SUPPORT','ACCOUNTANT'));
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_status_check" CHECK (status IN ('ACTIVE','SOLD','EXPIRED','REMOVED','PENDING')),
  ADD CONSTRAINT "Listing_type_check" CHECK (type IN ('STANDARD','AUCTION','ANNOUNCE')),
  ADD CONSTRAINT "Listing_condition_check" CHECK (condition IN ('NEW','LIKE_NEW','USED')),
  ADD CONSTRAINT "Listing_images_check" CHECK (jsonb_typeof(images::jsonb) = 'array' AND NOT jsonb_path_exists(images::jsonb, '$[*] ? (@.type() != "string")'));
CREATE INDEX "Listing_images_json_idx" ON "Listing" USING GIN ((images::jsonb) jsonb_path_ops);
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_status_check" CHECK (status IN ('LIVE','ENDED','NO_SALE','CANCELLED'));
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_status_check" CHECK (status IN ('PENDING','CONFIRMED','CANCELLED','DISPUTED','EXPIRED')),
  ADD CONSTRAINT "Transaction_source_check" CHECK (source IN ('AUCTION','STANDARD')),
  ADD CONSTRAINT "Transaction_answers_check" CHECK (("sellerAnswer" IS NULL OR "sellerAnswer" IN ('YES','NO')) AND ("buyerAnswer" IS NULL OR "buyerAnswer" IN ('YES','NO')));
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_status_check" CHECK (status IN ('PENDING','PAID','FAILED'));
ALTER TABLE "Review" ADD CONSTRAINT "Review_rating_check" CHECK (rating BETWEEN 1 AND 5);
COMMIT;
