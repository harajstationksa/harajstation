-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");
-- CreateIndex
CREATE INDEX "Campaign_listingId_idx" ON "Campaign"("listingId");
-- CreateIndex
CREATE INDEX "CredibilityLog_userId_createdAt_idx" ON "CredibilityLog"("userId", "createdAt");
-- CreateIndex
CREATE INDEX "Evidence_disputeId_idx" ON "Evidence"("disputeId");
-- CreateIndex
CREATE INDEX "Favorite_listingId_idx" ON "Favorite"("listingId");
-- CreateIndex
CREATE INDEX "Listing_storeId_idx" ON "Listing"("storeId");
-- CreateIndex
CREATE INDEX "Message_imageUrl_idx" ON "Message"("imageUrl");
