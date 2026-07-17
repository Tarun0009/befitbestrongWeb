CREATE TYPE "WebhookProcessingOutcome" AS ENUM (
  'PROCESSED',
  'IGNORED',
  'REJECTED',
  'RECONCILIATION_REQUIRED'
);

ALTER TABLE "WebhookEvent"
  ADD COLUMN "outcome" "WebhookProcessingOutcome",
  ADD COLUMN "processingCode" TEXT,
  ADD COLUMN "processingMessage" TEXT,
  ADD COLUMN "localOrderId" TEXT,
  ADD COLUMN "providerPaymentId" TEXT;

CREATE INDEX "WebhookEvent_provider_outcome_createdAt_idx"
  ON "WebhookEvent"("provider", "outcome", "createdAt");

CREATE INDEX "WebhookEvent_localOrderId_createdAt_idx"
  ON "WebhookEvent"("localOrderId", "createdAt");
