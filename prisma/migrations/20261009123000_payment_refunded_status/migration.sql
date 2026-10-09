-- Refunded/voided invoices claw back their points and are marked REFUNDED.
ALTER TABLE "Payment" DROP CONSTRAINT IF EXISTS "Payment_status_check";
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_status_check" CHECK (status IN ('PENDING','PAID','FAILED','REFUNDED'));
