CREATE TYPE "RefundIntentStatus" AS ENUM (
  'REQUESTED',
  'PROCESSING',
  'PENDING',
  'PROCESSED',
  'FAILED',
  'RECONCILIATION_REQUIRED'
);

CREATE TYPE "RefundKind" AS ENUM ('FULL', 'PARTIAL');

CREATE TABLE "RefundIntent" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "requestKeyHash" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerPaymentId" TEXT,
  "providerRefundId" TEXT,
  "providerIdempotencyKey" TEXT NOT NULL,
  "kind" "RefundKind" NOT NULL,
  "amount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "RefundIntentStatus" NOT NULL DEFAULT 'REQUESTED',
  "providerStatus" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "leaseExpiresAt" TIMESTAMP(3),
  "nextReconcileAt" TIMESTAMP(3),
  "lastAttemptAt" TIMESTAMP(3),
  "lastReconciledAt" TIMESTAMP(3),
  "failureCode" TEXT,
  "failureMessage" TEXT,
  "rawPayload" JSONB,
  "processedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RefundIntent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RefundEvent" (
  "id" TEXT NOT NULL,
  "refundIntentId" TEXT NOT NULL,
  "fromStatus" "RefundIntentStatus",
  "toStatus" "RefundIntentStatus" NOT NULL,
  "source" TEXT NOT NULL,
  "message" TEXT,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RefundEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RefundIntent_providerRefundId_key"
  ON "RefundIntent"("providerRefundId");
CREATE UNIQUE INDEX "RefundIntent_providerIdempotencyKey_key"
  ON "RefundIntent"("providerIdempotencyKey");
CREATE UNIQUE INDEX "RefundIntent_orderId_requestKeyHash_key"
  ON "RefundIntent"("orderId", "requestKeyHash");
CREATE INDEX "RefundIntent_orderId_createdAt_idx"
  ON "RefundIntent"("orderId", "createdAt" DESC);
CREATE INDEX "RefundIntent_paymentId_status_idx"
  ON "RefundIntent"("paymentId", "status");
CREATE INDEX "RefundIntent_status_nextReconcileAt_idx"
  ON "RefundIntent"("status", "nextReconcileAt");
CREATE INDEX "RefundEvent_refundIntentId_createdAt_idx"
  ON "RefundEvent"("refundIntentId", "createdAt");

ALTER TABLE "RefundIntent" ADD CONSTRAINT "RefundIntent_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RefundIntent" ADD CONSTRAINT "RefundIntent_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RefundEvent" ADD CONSTRAINT "RefundEvent_refundIntentId_fkey"
  FOREIGN KEY ("refundIntentId") REFERENCES "RefundIntent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
