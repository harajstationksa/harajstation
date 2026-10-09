-- Preserve legacy rows while disabling options the product cannot actually render or grant.
UPDATE "Banner" SET status = 'DISABLED' WHERE position NOT IN ('HOME_TOP', 'HOME_MIDDLE');
UPDATE "Plan" SET "isActive" = false WHERE key NOT IN ('FREE', 'PRO_MONTHLY');
UPDATE "Plan" SET "isActive" = true WHERE key IN ('FREE', 'PRO_MONTHLY');
