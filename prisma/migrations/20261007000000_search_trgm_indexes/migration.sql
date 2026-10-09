-- Enable trigram search so the existing ILIKE/LIKE contains predicates can use
-- a GIN index instead of sequentially scanning every listing.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "Listing_searchText_trgm_idx"
  ON "Listing" USING GIN ("searchText" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Listing_title_trgm_idx"
  ON "Listing" USING GIN ("title" gin_trgm_ops);
