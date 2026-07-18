import { createHash, timingSafeEqual } from "node:crypto";
import type { Prisma, ShipmentStatus } from "@prisma/client";
import { prisma } from "../../config/db.js";
import { HttpError } from "../../middleware/errorHandler.js";
import { transition } from "../orders/stateMachine.js";
import type { NormalizedCourierEvent } from "./courier.types.js";
import { canShipmentTransition, normalizeShiprocketStatus } from "./fulfillment.policy.js";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function dateValue(value: unknown): Date | undefined {
  const text = stringValue(value);
  if (!text) return undefined;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function hashWebhookBody(rawBody: string) {
  return createHash("sha256").update(rawBody).digest("hex");
}

export function verifyCourierWebhookToken(
  provided: string | undefined,
  expected: string | undefined,
) {
  if (!provided || !expected) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function parseShiprocketWebhook(
  payload: unknown,
  fallbackEventId: string,
): NormalizedCourierEvent | null {
  const body = record(payload);
  const statusText =
    stringValue(body.current_status) ??
    stringValue(body.shipment_status) ??
    stringValue(body.status);
  if (!statusText) return null;
  const status = normalizeShiprocketStatus(statusText);
  if (!status) return null;

  const scans = Array.isArray(body.scans) ? body.scans : [];
  const latestScan = record(scans[0]);
  const eventId =
    stringValue(body.event_id) ??
    fallbackEventId;
  return {
    eventId,
    trackingNumber:
      stringValue(body.awb) ??
      stringValue(body.awb_code) ??
      stringValue(body.tracking_number),
    providerShipmentId:
      stringValue(body.shipment_id) ??
      stringValue(body.shipmentId),
    status,
    description:
      stringValue(body.activity) ??
      stringValue(body.current_status) ??
      stringValue(latestScan.activity),
    location:
      stringValue(body.location) ??
      stringValue(latestScan.location),
    occurredAt:
      dateValue(body.current_timestamp) ??
      dateValue(body.updated_at) ??
      dateValue(latestScan.date) ??
      new Date(),
    estimatedDeliveryAt:
      dateValue(body.etd) ?? dateValue(body.estimated_delivery_date),
  };
}

async function findShipment(event: NormalizedCourierEvent) {
  if (event.providerShipmentId) {
    const shipment = await prisma.shipment.findUnique({
      where: {
        provider_providerShipmentId: {
          provider: "shiprocket",
          providerShipmentId: event.providerShipmentId,
        },
      },
      include: { order: { select: { status: true } } },
    });
    if (shipment) return shipment;
  }
  if (event.trackingNumber) {
    return prisma.shipment.findFirst({
      where: {
        provider: "shiprocket",
        trackingNumber: event.trackingNumber,
      },
      include: { order: { select: { status: true } } },
    });
  }
  return null;
}

async function applyEventInTransaction(
  tx: Prisma.TransactionClient,
  shipmentId: string,
  event: NormalizedCourierEvent,
) {
  const existing = await tx.shipmentEvent.findUnique({
    where: {
      shipmentId_externalEventId: {
        shipmentId,
        externalEventId: event.eventId,
      },
    },
  });
  if (existing) return;

  const current = await tx.shipment.findUnique({
    where: { id: shipmentId },
    select: { status: true },
  });
  if (!current) return;

  // Providers can deliver scans out of order. A late scan is still persisted
  // below for support/audit, but it must never regress the canonical state.
  const latestEvent = await tx.shipmentEvent.findFirst({
    where: { shipmentId },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    select: { occurredAt: true },
  });
  const staleEvent =
    latestEvent !== null && event.occurredAt < latestEvent.occurredAt;
  const shouldAdvance =
    !staleEvent && canShipmentTransition(current.status, event.status);

  const update: Prisma.ShipmentUpdateManyMutationInput = {
    lastSyncedAt: new Date(),
    syncError: null,
  };
  if (shouldAdvance) {
    update.status = event.status;
    if (event.estimatedDeliveryAt) {
      update.estimatedDeliveryAt = event.estimatedDeliveryAt;
    }
    if (["PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY"].includes(event.status)) {
      update.shippedAt = event.occurredAt;
    }
    if (event.status === "DELIVERED") {
      update.deliveredAt = event.occurredAt;
    }
  }

  // Optimistic status predicate prevents two concurrent webhook workers from
  // applying a stale status after another worker has already advanced it.
  await tx.shipment.updateMany({
    where: { id: shipmentId, status: current.status },
    data: update,
  });

  await tx.shipmentEvent.create({
    data: {
      shipmentId,
      status: event.status,
      description: event.description,
      location: event.location,
      source: "shiprocket",
      externalEventId: event.eventId,
      occurredAt: event.occurredAt,
    },
  });
}

function impliesShipmentHandoff(status: ShipmentStatus) {
  return ["PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY"].includes(status);
}

export async function applyCourierEvent(event: NormalizedCourierEvent) {
  const shipment = await findShipment(event);
  if (!shipment) {
    throw new HttpError(
      404,
      "shipment_not_found",
      "No shipment matches this courier event",
    );
  }

  let orderStatus = shipment.order.status;
  if (
    (impliesShipmentHandoff(event.status) || event.status === "DELIVERED") &&
    ["PAID", "CONFIRMED"].includes(orderStatus)
  ) {
    await transition(prisma, shipment.orderId, "SHIPPED", {
      actor: {
        kind: "system",
        note: `Shiprocket reported ${event.status}`,
      },
      transactionWork:
        event.status === "DELIVERED"
          ? undefined
          : (tx) => applyEventInTransaction(tx, shipment.id, event),
    });
    orderStatus = "SHIPPED";
    if (event.status !== "DELIVERED") return shipment.id;
  }

  if (event.status === "DELIVERED" && orderStatus === "SHIPPED") {
    const otherOpenShipments = await prisma.shipment.count({
      where: {
        orderId: shipment.orderId,
        id: { not: shipment.id },
        status: { notIn: ["DELIVERED", "CANCELLED"] },
      },
    });
    if (otherOpenShipments === 0) {
      await transition(prisma, shipment.orderId, "DELIVERED", {
        actor: {
          kind: "system",
          note: "All active shipments delivered",
        },
        transactionWork: (tx) =>
          applyEventInTransaction(tx, shipment.id, event),
      });
      return shipment.id;
    }
  }

  await prisma.$transaction((tx) =>
    applyEventInTransaction(tx, shipment.id, event),
  );
  return shipment.id;
}
