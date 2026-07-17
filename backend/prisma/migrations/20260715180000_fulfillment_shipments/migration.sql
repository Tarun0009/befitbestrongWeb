CREATE TYPE "ShipmentStatus" AS ENUM (
  'LABEL_CREATED',
  'PICKED_UP',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'DELIVERY_FAILED',
  'RTO_IN_TRANSIT',
  'RETURNED',
  'CANCELLED'
);

CREATE TABLE "Shipment" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "carrier" TEXT NOT NULL,
  "service" TEXT,
  "trackingNumber" TEXT NOT NULL,
  "trackingUrl" TEXT,
  "status" "ShipmentStatus" NOT NULL DEFAULT 'IN_TRANSIT',
  "estimatedDeliveryAt" TIMESTAMP(3),
  "shippedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deliveredAt" TIMESTAMP(3),
  "createdById" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShipmentEvent" (
  "id" TEXT NOT NULL,
  "shipmentId" TEXT NOT NULL,
  "status" "ShipmentStatus" NOT NULL,
  "description" TEXT,
  "location" TEXT,
  "source" TEXT NOT NULL DEFAULT 'manual',
  "externalEventId" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShipmentEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Shipment_carrier_trackingNumber_key"
  ON "Shipment"("carrier", "trackingNumber");
CREATE INDEX "Shipment_orderId_createdAt_idx"
  ON "Shipment"("orderId", "createdAt" DESC);
CREATE INDEX "Shipment_status_updatedAt_idx"
  ON "Shipment"("status", "updatedAt" DESC);
CREATE UNIQUE INDEX "ShipmentEvent_shipmentId_externalEventId_key"
  ON "ShipmentEvent"("shipmentId", "externalEventId");
CREATE INDEX "ShipmentEvent_shipmentId_occurredAt_idx"
  ON "ShipmentEvent"("shipmentId", "occurredAt" DESC);

ALTER TABLE "Shipment"
  ADD CONSTRAINT "Shipment_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ShipmentEvent"
  ADD CONSTRAINT "ShipmentEvent_shipmentId_fkey"
  FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
