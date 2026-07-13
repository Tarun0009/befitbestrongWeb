CREATE TYPE "LoyaltyEntryType" AS ENUM (
  'ORDER_EARN',
  'ORDER_REFUND_REVERSAL',
  'REFERRAL_BONUS',
  'REFERRAL_REVERSAL',
  'COUPON_REDEMPTION',
  'REDEMPTION_RESTORE',
  'ADMIN_ADJUSTMENT'
);

CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'REWARDED', 'CANCELLED');

ALTER TABLE "User"
ADD COLUMN "pointsBalance" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lifetimePointsEarned" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lifetimePointsRedeemed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "referralCode" TEXT;

CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");

ALTER TABLE "Coupon"
ADD COLUMN "maxUses" INTEGER,
ADD COLUMN "usedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "assignedUserId" TEXT,
ADD COLUMN "source" TEXT NOT NULL DEFAULT 'MANUAL';

CREATE INDEX "Coupon_assignedUserId_active_idx" ON "Coupon"("assignedUserId", "active");

CREATE TABLE "LoyaltyConfig" (
  "id" TEXT NOT NULL DEFAULT 'main',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "earnPointsPerRupee" INTEGER NOT NULL DEFAULT 1,
  "redeemPointsPerRupee" INTEGER NOT NULL DEFAULT 10,
  "minRedeemPoints" INTEGER NOT NULL DEFAULT 100,
  "maxRedeemPointsPerCoupon" INTEGER,
  "referralBonusReferrer" INTEGER NOT NULL DEFAULT 250,
  "referralBonusReferred" INTEGER NOT NULL DEFAULT 100,
  "couponValidityDays" INTEGER NOT NULL DEFAULT 30,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LoyaltyConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LoyaltyEntry" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "LoyaltyEntryType" NOT NULL,
  "points" INTEGER NOT NULL,
  "orderId" TEXT,
  "couponCode" TEXT,
  "referralId" TEXT,
  "description" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LoyaltyEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LoyaltyEntry_points_nonzero" CHECK ("points" <> 0)
);

CREATE TABLE "Referral" (
  "id" TEXT NOT NULL,
  "referrerId" TEXT NOT NULL,
  "referredUserId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
  "qualifyingOrderId" TEXT,
  "referrerBonus" INTEGER,
  "referredBonus" INTEGER,
  "rewardedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LoyaltyEntry_idempotencyKey_key" ON "LoyaltyEntry"("idempotencyKey");
CREATE INDEX "LoyaltyEntry_userId_createdAt_idx" ON "LoyaltyEntry"("userId", "createdAt" DESC);
CREATE INDEX "LoyaltyEntry_orderId_type_idx" ON "LoyaltyEntry"("orderId", "type");
CREATE INDEX "LoyaltyEntry_referralId_type_idx" ON "LoyaltyEntry"("referralId", "type");
CREATE UNIQUE INDEX "Referral_referredUserId_key" ON "Referral"("referredUserId");
CREATE UNIQUE INDEX "Referral_qualifyingOrderId_key" ON "Referral"("qualifyingOrderId");
CREATE INDEX "Referral_referrerId_status_createdAt_idx" ON "Referral"("referrerId", "status", "createdAt" DESC);
CREATE INDEX "Referral_code_idx" ON "Referral"("code");

ALTER TABLE "Coupon"
ADD CONSTRAINT "Coupon_assignedUserId_fkey"
FOREIGN KEY ("assignedUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LoyaltyEntry"
ADD CONSTRAINT "LoyaltyEntry_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Referral"
ADD CONSTRAINT "Referral_referrerId_fkey"
FOREIGN KEY ("referrerId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Referral"
ADD CONSTRAINT "Referral_referredUserId_fkey"
FOREIGN KEY ("referredUserId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "LoyaltyConfig" (
  "id",
  "enabled",
  "earnPointsPerRupee",
  "redeemPointsPerRupee",
  "minRedeemPoints",
  "referralBonusReferrer",
  "referralBonusReferred",
  "couponValidityDays",
  "createdAt",
  "updatedAt"
)
VALUES ('main', true, 1, 10, 100, 250, 100, 30, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
