-- Phone numbers are unverified (no SMS provider yet): a unique constraint let
-- anyone squat another person's number and revealed which numbers exist.
-- Verified ownership is enforced in application code instead.
DROP INDEX IF EXISTS "User_phone_key";
CREATE INDEX "User_phone_idx" ON "User"("phone");
