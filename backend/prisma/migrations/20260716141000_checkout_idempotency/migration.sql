CREATE TYPE "CheckoutAttemptStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE "CheckoutAttempt" (
  "id" TEXT NOT NULL,
  "ownerHash" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "status" "CheckoutAttemptStatus" NOT NULL DEFAULT 'PROCESSING',
  "orderId" TEXT,
  "leaseExpiresAt" TIMESTAMP(3) NOT NULL,
  "failureStatus" INTEGER,
  "failureCode" TEXT,
  "failureMessage" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CheckoutAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CheckoutAttempt_orderId_key" ON "CheckoutAttempt"("orderId");
CREATE UNIQUE INDEX "CheckoutAttempt_ownerHash_keyHash_key" ON "CheckoutAttempt"("ownerHash", "keyHash");
CREATE INDEX "CheckoutAttempt_status_leaseExpiresAt_idx" ON "CheckoutAttempt"("status", "leaseExpiresAt");
CREATE INDEX "CheckoutAttempt_createdAt_idx" ON "CheckoutAttempt"("createdAt");

ALTER TABLE "CheckoutAttempt"
  ADD CONSTRAINT "CheckoutAttempt_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
