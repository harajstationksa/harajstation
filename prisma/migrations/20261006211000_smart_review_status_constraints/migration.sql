ALTER TABLE "Listing" DROP CONSTRAINT IF EXISTS "Listing_status_check";
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_status_check"
  CHECK (status IN ('ACTIVE','PENDING','AWAITING_INFO','SOLD','EXPIRED','REMOVED'));

ALTER TABLE "Auction" DROP CONSTRAINT IF EXISTS "Auction_status_check";
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_status_check"
  CHECK (status IN ('PENDING','LIVE','ENDED','NO_SALE','CANCELLED'));
