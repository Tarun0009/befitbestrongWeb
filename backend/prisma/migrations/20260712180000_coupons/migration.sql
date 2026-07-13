CREATE TYPE "CouponType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');

ALTER TABLE "Order"
  ADD COLUMN "discount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "couponCode" TEXT;

CREATE TABLE "Coupon" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "description" TEXT,
  "type" "CouponType" NOT NULL,
  "value" INTEGER NOT NULL,
  "minSubtotal" INTEGER NOT NULL DEFAULT 0,
  "maxDiscount" INTEGER,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");
CREATE INDEX "Coupon_active_startsAt_endsAt_idx"
  ON "Coupon"("active", "startsAt", "endsAt");
