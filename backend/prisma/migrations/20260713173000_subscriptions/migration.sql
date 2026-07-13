CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAUSED', 'CANCELLED');
CREATE TYPE "SubscriptionRenewalStatus" AS ENUM ('READY', 'STOCK_BLOCKED', 'SKIPPED', 'ORDERED');

CREATE TABLE "SubscriptionPlan" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "discountPercent" INTEGER NOT NULL DEFAULT 10,
  "allowedFrequencies" INTEGER[] DEFAULT ARRAY[30, 60, 90]::INTEGER[],
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SubscriptionPlan_discount_check" CHECK ("discountPercent" BETWEEN 1 AND 50)
);

CREATE TABLE "UserSubscription" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "planNameSnapshot" TEXT NOT NULL,
  "discountPercent" INTEGER NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "frequencyDays" INTEGER NOT NULL,
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
  "nextOrderAt" TIMESTAMP(3) NOT NULL,
  "contactEmail" TEXT NOT NULL,
  "shippingSnapshot" JSONB NOT NULL,
  "createdFromOrderId" TEXT,
  "pausedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserSubscription_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UserSubscription_quantity_check" CHECK ("quantity" BETWEEN 1 AND 20),
  CONSTRAINT "UserSubscription_frequency_check" CHECK ("frequencyDays" BETWEEN 7 AND 365)
);

CREATE TABLE "SubscriptionRenewal" (
  "id" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "status" "SubscriptionRenewalStatus" NOT NULL,
  "unitPriceSnapshot" INTEGER NOT NULL,
  "discountedUnitPrice" INTEGER NOT NULL,
  "quantity" INTEGER NOT NULL,
  "notifiedAt" TIMESTAMP(3),
  "orderId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SubscriptionRenewal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SubscriptionPlan_variantId_key" ON "SubscriptionPlan"("variantId");
CREATE INDEX "SubscriptionPlan_active_createdAt_idx" ON "SubscriptionPlan"("active", "createdAt" DESC);
CREATE INDEX "UserSubscription_userId_status_nextOrderAt_idx" ON "UserSubscription"("userId", "status", "nextOrderAt");
CREATE INDEX "UserSubscription_status_nextOrderAt_idx" ON "UserSubscription"("status", "nextOrderAt");
CREATE INDEX "UserSubscription_planId_idx" ON "UserSubscription"("planId");
CREATE UNIQUE INDEX "SubscriptionRenewal_subscriptionId_scheduledFor_key" ON "SubscriptionRenewal"("subscriptionId", "scheduledFor");
CREATE INDEX "SubscriptionRenewal_status_scheduledFor_idx" ON "SubscriptionRenewal"("status", "scheduledFor");

ALTER TABLE "SubscriptionPlan" ADD CONSTRAINT "SubscriptionPlan_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserSubscription" ADD CONSTRAINT "UserSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserSubscription" ADD CONSTRAINT "UserSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubscriptionRenewal" ADD CONSTRAINT "SubscriptionRenewal_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "UserSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;