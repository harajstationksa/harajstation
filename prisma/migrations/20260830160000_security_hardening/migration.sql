-- Session revocation and stable Google identity.
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "googleSub" TEXT;
CREATE UNIQUE INDEX "User_googleSub_key" ON "User"("googleSub");

-- Moyasar assigns the invoice id after the local payment row is created.
ALTER TABLE "Payment" ALTER COLUMN "invoiceId" DROP NOT NULL;

-- Conditional once-per-user promo enforcement (NULL remains repeatable).
ALTER TABLE "PromoRedemption" ADD COLUMN "eligibilityKey" TEXT;
CREATE UNIQUE INDEX "PromoRedemption_eligibilityKey_key"
  ON "PromoRedemption"("eligibilityKey");

CREATE UNIQUE INDEX "ReferralEarning_paymentId_key"
  ON "ReferralEarning"("paymentId");

-- A cron retry must never create two transactions for one auction.
ALTER TABLE "Transaction" ADD COLUMN "auctionId" TEXT;
CREATE UNIQUE INDEX "Transaction_auctionId_key" ON "Transaction"("auctionId");

-- Only one ACTIVE campaign may spend points for the same listing.
CREATE UNIQUE INDEX "Campaign_one_active_per_listing"
  ON "Campaign"("listingId") WHERE "status" = 'ACTIVE';

-- Existing one-time links were stored in plaintext. Invalidate them so all
-- newly issued rows use SHA-256 digests without retaining usable legacy links.
DELETE FROM "EmailVerificationToken";
DELETE FROM "PasswordResetToken";
