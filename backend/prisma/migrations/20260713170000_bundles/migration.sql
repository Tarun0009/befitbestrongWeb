CREATE TYPE "BundlePricingType" AS ENUM ('FIXED_PRICE', 'PERCENTAGE_OFF');

ALTER TABLE "Order"
  ADD COLUMN "bundleDiscount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "couponDiscount" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "Bundle" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "imageUrl" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "pricingType" "BundlePricingType" NOT NULL,
  "value" INTEGER NOT NULL,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Bundle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BundleItem" (
  "id" TEXT NOT NULL,
  "bundleId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "position" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "BundleItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Bundle_slug_key" ON "Bundle"("slug");
CREATE INDEX "Bundle_active_createdAt_idx" ON "Bundle"("active", "createdAt" DESC);
CREATE UNIQUE INDEX "BundleItem_bundleId_variantId_key" ON "BundleItem"("bundleId", "variantId");
CREATE INDEX "BundleItem_variantId_idx" ON "BundleItem"("variantId");

ALTER TABLE "BundleItem"
  ADD CONSTRAINT "BundleItem_bundleId_fkey"
  FOREIGN KEY ("bundleId") REFERENCES "Bundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BundleItem"
  ADD CONSTRAINT "BundleItem_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Bundle"
  ADD CONSTRAINT "Bundle_value_check" CHECK ("value" > 0);
ALTER TABLE "BundleItem"
  ADD CONSTRAINT "BundleItem_quantity_check" CHECK ("quantity" > 0);