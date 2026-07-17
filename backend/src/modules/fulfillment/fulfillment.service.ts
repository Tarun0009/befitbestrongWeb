import type { Prisma } from "@prisma/client";
import type { ManualShipmentInput } from "./fulfillment.policy.js";

export async function createManualShipment(
  tx: Prisma.TransactionClient,
  orderId: string,
  adminUserId: string,
  input: ManualShipmentInput,
) {
  const shippedAt = new Date();
  return tx.shipment.create({
    data: {
      orderId,
      carrier: input.carrier,
      service: input.service,
      trackingNumber: input.trackingNumber.toUpperCase(),
      trackingUrl: input.trackingUrl,
      estimatedDeliveryAt: input.estimatedDeliveryAt,
      shippedAt,
      createdById: adminUserId,
      status: "IN_TRANSIT",
      events: {
        create: {
          status: "IN_TRANSIT",
          description: input.note || "Shipment dispatched",
          source: "manual",
          occurredAt: shippedAt,
        },
      },
    },
    include: {
      events: { orderBy: { occurredAt: "desc" } },
    },
  });
}

export async function markOpenShipmentsDelivered(
  tx: Prisma.TransactionClient,
  orderId: string,
  note?: string,
) {
  const openShipments = await tx.shipment.findMany({
    where: {
      orderId,
      status: { notIn: ["DELIVERED", "RETURNED", "CANCELLED"] },
    },
    select: { id: true },
  });

  const deliveredAt = new Date();
  for (const shipment of openShipments) {
    await tx.shipment.update({
      where: { id: shipment.id },
      data: { status: "DELIVERED", deliveredAt },
    });
    await tx.shipmentEvent.create({
      data: {
        shipmentId: shipment.id,
        status: "DELIVERED",
        description: note || "Delivery confirmed by an administrator",
        source: "manual",
        occurredAt: deliveredAt,
      },
    });
  }
}
