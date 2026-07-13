CREATE TABLE "WishlistItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WishlistItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StockAlert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockAlert_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WishlistItem_userId_productId_key" ON "WishlistItem"("userId", "productId");
CREATE INDEX "WishlistItem_productId_createdAt_idx" ON "WishlistItem"("productId", "createdAt" DESC);
CREATE UNIQUE INDEX "StockAlert_userId_variantId_key" ON "StockAlert"("userId", "variantId");
CREATE INDEX "StockAlert_variantId_active_createdAt_idx" ON "StockAlert"("variantId", "active", "createdAt" DESC);
CREATE INDEX "StockAlert_userId_active_createdAt_idx" ON "StockAlert"("userId", "active", "createdAt" DESC);

ALTER TABLE "WishlistItem"
ADD CONSTRAINT "WishlistItem_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WishlistItem"
ADD CONSTRAINT "WishlistItem_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StockAlert"
ADD CONSTRAINT "StockAlert_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StockAlert"
ADD CONSTRAINT "StockAlert_variantId_fkey"
FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
