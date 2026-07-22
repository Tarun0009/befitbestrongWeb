-- Payment/order safety: cart-scoped checkout claims, per-attempt provider
-- records, payment reconciliation scheduling, and durable webhook DLQ state.

CREATE TYPE "PaymentAttemptStatus" AS ENUM ('AUTHORIZED', 'CAPTURED', 'FAILED');

ALTER TABLE "CheckoutAttempt"
ADD COLUMN "cartRevision" TEXT;

CREATE UNIQUE INDEX "CheckoutAttempt_ownerHash_cartRevision_key"
ON "CheckoutAttempt"("ownerHash", "cartRevision");

ALTER TABLE "Order"
ADD COLUMN "paymentNextReconcileAt" TIMESTAMP(3),
ADD COLUMN "paymentLastReconciledAt" TIMESTAMP(3),
ADD COLUMN "paymentReconcileAttempts" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "Order_status_paymentNextReconcileAt_idx"
ON "Order"("status", "paymentNextReconcileAt");

CREATE TABLE "PaymentAttempt" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "providerPaymentId" TEXT NOT NULL,
    "providerOrderId" TEXT NOT NULL,
    "status" "PaymentAttemptStatus" NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentAttempt_providerPaymentId_key"
ON "PaymentAttempt"("providerPaymentId");

CREATE INDEX "PaymentAttempt_paymentId_createdAt_idx"
ON "PaymentAttempt"("paymentId", "createdAt" DESC);

CREATE INDEX "PaymentAttempt_providerOrderId_status_idx"
ON "PaymentAttempt"("providerOrderId", "status");

ALTER TABLE "PaymentAttempt"
ADD CONSTRAINT "PaymentAttempt_paymentId_fkey"
FOREIGN KEY ("paymentId") REFERENCES "Payment"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WebhookEvent"
ADD COLUMN "deliveryAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastAttemptAt" TIMESTAMP(3),
ADD COLUMN "deadLetteredAt" TIMESTAMP(3),
ADD COLUMN "deadLetterReason" TEXT;

CREATE INDEX "WebhookEvent_processedAt_deadLetteredAt_createdAt_idx"
ON "WebhookEvent"("processedAt", "deadLetteredAt", "createdAt");
