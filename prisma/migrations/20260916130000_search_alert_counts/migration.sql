CREATE TABLE "SavedSearchMatch" (
 "searchId" TEXT NOT NULL,
 "listingId" TEXT NOT NULL,
 CONSTRAINT "SavedSearchMatch_pkey" PRIMARY KEY ("searchId", "listingId"),
 CONSTRAINT "SavedSearchMatch_searchId_fkey" FOREIGN KEY ("searchId") REFERENCES "SavedSearch"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "SavedSearchMatch_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
