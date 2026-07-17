CREATE TYPE "CourierBookingStatus" AS ENUM (
  'PENDING',
  'ORDER_CREATED',
  'AWB_ASSIGNED',
  'READY',
  'FAILED',
  'CANCELLED'
);

ALTER TABLE "Shipment"
  ALTER COLUMN "shippedAt" DROP NOT NULL,
  ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN "providerOrderId" TEXT,
  ADD COLUMN "providerShipmentId" TEXT,
  ADD COLUMN "labelUrl" TEXT,
  ADD COLUMN "pickupScheduledAt" TIMESTAMP(3),
  ADD COLUMN "lastSyncedAt" TIMESTAMP(3),
  ADD COLUMN "syncError" TEXT;

CREATE TABLE "CourierBooking" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "shipmentId" TEXT,
  "provider" TEXT NOT NULL,
  "status" "CourierBookingStatus" NOT NULL DEFAULT 'PENDING',
  "externalOrderRef" TEXT NOT NULL,
  "providerOrderId" TEXT,
  "providerShipmentId" TEXT,
  "courierId" TEXT,
  "carrier" TEXT,
  "trackingNumber" TEXT,
  "labelUrl" TEXT,
  "request" JSONB NOT NULL,
  "error" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CourierBooking_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Shipment_provider_providerShipmentId_key"
  ON "Shipment"("provider", "providerShipmentId");
CREATE UNIQUE INDEX "CourierBooking_shipmentId_key"
  ON "CourierBooking"("shipmentId");
CREATE UNIQUE INDEX "CourierBooking_orderId_provider_key"
  ON "CourierBooking"("orderId", "provider");
CREATE INDEX "CourierBooking_status_updatedAt_idx"
  ON "CourierBooking"("status", "updatedAt" DESC);

ALTER TABLE "CourierBooking"
  ADD CONSTRAINT "CourierBooking_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CourierBooking"
  ADD CONSTRAINT "CourierBooking_shipmentId_fkey"
  FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
