-- Order lifecycle additions
ALTER TYPE "OrderStatus" ADD VALUE 'CONFIRMED' AFTER 'PENDING';

CREATE TYPE "PaymentMethod" AS ENUM ('PREPAID', 'COD');
CREATE TYPE "ServiceZone" AS ENUM ('DELHI', 'NOIDA', 'GHAZIABAD');
CREATE TYPE "AdminNotificationType" AS ENUM ('ORDER_PAID', 'ORDER_COD_PLACED');

ALTER TABLE "Order"
  ADD COLUMN "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'PREPAID',
  ADD COLUMN "paymentFee" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "ServiceArea" (
  "id" TEXT NOT NULL,
  "pincode" TEXT NOT NULL,
  "zone" "ServiceZone" NOT NULL,
  "city" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "prepaidEnabled" BOOLEAN NOT NULL DEFAULT true,
  "codEnabled" BOOLEAN NOT NULL DEFAULT true,
  "codMaxOrderAmount" INTEGER NOT NULL DEFAULT 500000,
  "codFee" INTEGER NOT NULL DEFAULT 0,
  "estimatedDeliveryMinDays" INTEGER NOT NULL DEFAULT 1,
  "estimatedDeliveryMaxDays" INTEGER NOT NULL DEFAULT 3,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceArea_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ServiceAreaRequest" (
  "id" TEXT NOT NULL,
  "pincode" TEXT NOT NULL,
  "requesterHash" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "userId" TEXT,
  "productId" TEXT,
  "source" TEXT NOT NULL DEFAULT 'storefront',
  "attemptCount" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastRequestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceAreaRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminNotification" (
  "id" TEXT NOT NULL,
  "type" "AdminNotificationType" NOT NULL,
  "orderId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminNotification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminNotificationReceipt" (
  "notificationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminNotificationReceipt_pkey" PRIMARY KEY ("notificationId", "userId")
);

CREATE UNIQUE INDEX "ServiceArea_pincode_key" ON "ServiceArea"("pincode");
CREATE INDEX "ServiceArea_active_zone_idx" ON "ServiceArea"("active", "zone");
CREATE UNIQUE INDEX "ServiceAreaRequest_pincode_requesterHash_key" ON "ServiceAreaRequest"("pincode", "requesterHash");
CREATE INDEX "ServiceAreaRequest_pincode_createdAt_idx" ON "ServiceAreaRequest"("pincode", "createdAt" DESC);
CREATE INDEX "ServiceAreaRequest_userId_createdAt_idx" ON "ServiceAreaRequest"("userId", "createdAt" DESC);
CREATE INDEX "ServiceAreaRequest_productId_createdAt_idx" ON "ServiceAreaRequest"("productId", "createdAt" DESC);
CREATE UNIQUE INDEX "AdminNotification_type_orderId_key" ON "AdminNotification"("type", "orderId");
CREATE INDEX "AdminNotification_createdAt_idx" ON "AdminNotification"("createdAt" DESC);
CREATE INDEX "AdminNotificationReceipt_userId_readAt_idx" ON "AdminNotificationReceipt"("userId", "readAt" DESC);

ALTER TABLE "ServiceAreaRequest"
  ADD CONSTRAINT "ServiceAreaRequest_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ServiceAreaRequest"
  ADD CONSTRAINT "ServiceAreaRequest_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AdminNotification"
  ADD CONSTRAINT "AdminNotification_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AdminNotificationReceipt"
  ADD CONSTRAINT "AdminNotificationReceipt_notificationId_fkey"
  FOREIGN KEY ("notificationId") REFERENCES "AdminNotification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AdminNotificationReceipt"
  ADD CONSTRAINT "AdminNotificationReceipt_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


