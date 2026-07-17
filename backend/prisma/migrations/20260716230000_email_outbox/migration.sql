CREATE TYPE "EmailOutboxStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'SENT',
  'DEAD_LETTER',
  'CANCELLED'
);

CREATE TYPE "EmailTemplate" AS ENUM (
  'ORDER_STATUS',
  'ADMIN_ORDER_ALERT',
  'SUBSCRIPTION_RENEWAL',
  'BACK_IN_STOCK'
);

CREATE TABLE "EmailOutbox" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "providerIdempotencyKey" TEXT NOT NULL,
  "template" "EmailTemplate" NOT NULL,
  "recipientEmail" TEXT NOT NULL,
  "fromEmail" TEXT,
  "subject" TEXT NOT NULL,
  "html" TEXT NOT NULL,
  "referenceType" TEXT NOT NULL,
  "referenceId" TEXT NOT NULL,
  "referenceVersion" TEXT,
  "status" "EmailOutboxStatus" NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 8,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseExpiresAt" TIMESTAMP(3),
  "lastAttemptAt" TIMESTAMP(3),
  "providerMessageId" TEXT,
  "lastErrorCode" TEXT,
  "lastErrorMessage" TEXT,
  "sentAt" TIMESTAMP(3),
  "deadLetteredAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmailOutbox_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailOutboxEvent" (
  "id" TEXT NOT NULL,
  "emailOutboxId" TEXT NOT NULL,
  "fromStatus" "EmailOutboxStatus",
  "toStatus" "EmailOutboxStatus" NOT NULL,
  "source" TEXT NOT NULL,
  "message" TEXT,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailOutboxEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailOutbox_idempotencyKey_key"
  ON "EmailOutbox"("idempotencyKey");
CREATE UNIQUE INDEX "EmailOutbox_providerIdempotencyKey_key"
  ON "EmailOutbox"("providerIdempotencyKey");
CREATE INDEX "EmailOutbox_status_nextAttemptAt_idx"
  ON "EmailOutbox"("status", "nextAttemptAt");
CREATE INDEX "EmailOutbox_referenceType_referenceId_idx"
  ON "EmailOutbox"("referenceType", "referenceId");
CREATE INDEX "EmailOutbox_template_createdAt_idx"
  ON "EmailOutbox"("template", "createdAt" DESC);
CREATE INDEX "EmailOutboxEvent_emailOutboxId_createdAt_idx"
  ON "EmailOutboxEvent"("emailOutboxId", "createdAt");

ALTER TABLE "EmailOutboxEvent"
  ADD CONSTRAINT "EmailOutboxEvent_emailOutboxId_fkey"
  FOREIGN KEY ("emailOutboxId") REFERENCES "EmailOutbox"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
