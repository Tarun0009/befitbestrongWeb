ALTER TABLE "Order"
  ADD COLUMN "reservationExpiresAt" TIMESTAMP(3),
  ADD COLUMN "reservationExpiredAt" TIMESTAMP(3);

UPDATE "Order"
SET "reservationExpiresAt" = "createdAt" + INTERVAL '15 minutes'
WHERE "status" = 'PENDING' AND "reservationExpiresAt" IS NULL;

CREATE INDEX "Order_status_reservationExpiresAt_idx"
  ON "Order"("status", "reservationExpiresAt");
