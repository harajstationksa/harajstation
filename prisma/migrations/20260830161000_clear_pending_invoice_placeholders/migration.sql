-- Legacy checkout rows used the globally shared string "pending" before a
-- real Moyasar invoice existed. NULL is the correct unassigned state.
UPDATE "Payment"
SET "invoiceId" = NULL
WHERE "invoiceId" = 'pending';
