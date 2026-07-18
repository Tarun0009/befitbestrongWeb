import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/db.js";
import { HttpError } from "../../middleware/errorHandler.js";
import type {
  CourierAddress,
  CourierOrder,
  CourierOrderItem,
} from "./courier.types.js";
import { getConfiguredCourierProvider } from "./courier.registry.js";
import {
  courierBookingSchema,
  type CourierBookingInput,
} from "./fulfillment.policy.js";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function requiredString(
  value: unknown,
  field: string,
  code = "invalid_shipping_address",
) {
  if (typeof value === "string" && value.trim()) return value.trim();
  throw new HttpError(409, code, `Order is missing ${field}`);
}

function parseAddress(value: Prisma.JsonValue): CourierAddress {
  const body = record(value);
  return {
    fullName: requiredString(body.fullName, "shipping name"),
    phone: requiredString(body.phone, "shipping phone"),
    line1: requiredString(body.line1, "shipping address"),
    line2:
      typeof body.line2 === "string" && body.line2.trim()
        ? body.line2.trim()
        : undefined,
    city: requiredString(body.city, "shipping city"),
    state: requiredString(body.state, "shipping state"),
    pincode: requiredString(body.pincode, "shipping pincode"),
    country:
      typeof body.country === "string" && body.country.trim()
        ? body.country.trim()
        : "IN",
  };
}

function parseItems(
  items: Array<{
    productSnapshot: Prisma.JsonValue;
    unitPrice: number;
    quantity: number;
  }>,
): CourierOrderItem[] {
  return items.map((item) => {
    const snapshot = record(item.productSnapshot);
    return {
      name: requiredString(
        snapshot.name,
        "product name",
        "invalid_order_item",
      ),
      sku: requiredString(snapshot.sku, "product SKU", "invalid_order_item"),
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    };
  });
}

export function externalCourierOrderRef(orderId: string, createdAt: Date) {
  let hash = 0;
  for (const character of orderId) {
    hash = (hash * 31 + character.charCodeAt(0)) % 10_000_000;
  }
  return `${createdAt.getTime()}${String(hash).padStart(7, "0")}`;
}

function errorMessage(error: unknown) {
  return (
    (error instanceof Error ? error.message : "Courier booking failed")
      .replace(/[\r\n]+/g, " ")
      .slice(0, 500)
  );
}

export async function bookOrderWithCourier(
  orderId: string,
  adminUserId: string,
  rawInput: CourierBookingInput,
) {
  const provider = getConfiguredCourierProvider();
  const input = courierBookingSchema.parse(rawInput);
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) {
    throw new HttpError(404, "order_not_found", "Order not found");
  }
  if (!["PAID", "CONFIRMED"].includes(order.status)) {
    throw new HttpError(
      409,
      "order_not_bookable",
      `Courier booking is not available for ${order.status} orders`,
    );
  }

  let booking = await prisma.courierBooking.findUnique({
    where: {
      orderId_provider: { orderId, provider: provider.key },
    },
    include: { shipment: { include: { events: true } } },
  });
  if (booking?.status === "READY" && booking.shipment) {
    return booking;
  }

  if (!booking) {
    booking = await prisma.courierBooking.create({
      data: {
        orderId,
        provider: provider.key,
        externalOrderRef: externalCourierOrderRef(order.id, order.createdAt),
        request: input,
        createdById: adminUserId,
      },
      include: { shipment: { include: { events: true } } },
    });
  }
  const persistedInput = courierBookingSchema.parse(booking.request);
  booking = await prisma.courierBooking.update({
    where: { id: booking.id },
    data: {
      attemptCount: { increment: 1 },
      error: null,
    },
    include: { shipment: { include: { events: true } } },
  });

  const courierOrder: CourierOrder = {
    id: order.id,
    externalOrderRef: booking.externalOrderRef,
    createdAt: order.createdAt,
    contactEmail: order.contactEmail,
    paymentMethod: order.paymentMethod,
    subtotal: order.subtotal,
    discount: order.discount,
    shipping: order.shipping,
    total: order.total,
    address: parseAddress(order.addressSnapshot),
    items: parseItems(order.items),
    parcel: persistedInput,
  };

  try {
    if (!booking.providerOrderId || !booking.providerShipmentId) {
      const created =
        (await provider.findOrder(booking.externalOrderRef)) ??
        (await provider.createOrder(courierOrder));
      booking = await prisma.courierBooking.update({
        where: { id: booking.id },
        data: {
          status: "ORDER_CREATED",
          providerOrderId: created.providerOrderId,
          providerShipmentId: created.providerShipmentId,
        },
        include: { shipment: { include: { events: true } } },
      });
    }

    if (!booking.trackingNumber || !booking.carrier) {
      const awb = await provider.assignAwb(
        booking.providerShipmentId!,
        persistedInput.courierId,
      );
      booking = await prisma.courierBooking.update({
        where: { id: booking.id },
        data: {
          status: "AWB_ASSIGNED",
          trackingNumber: awb.trackingNumber.toUpperCase(),
          carrier: awb.carrier,
          courierId: awb.courierId,
        },
        include: { shipment: { include: { events: true } } },
      });
    }

    if (!booking.shipmentId) {
      const createdAt = new Date();
      booking = await prisma.$transaction(async (tx) => {
        const shipment = await tx.shipment.create({
          data: {
            orderId,
            carrier: booking!.carrier!,
            trackingNumber: booking!.trackingNumber!,
            provider: provider.key,
            providerOrderId: booking!.providerOrderId,
            providerShipmentId: booking!.providerShipmentId,
            trackingUrl: null,
            status: "LABEL_CREATED",
            shippedAt: null,
            createdById: adminUserId,
            metadata: {
              weightKg: persistedInput.weightKg,
              lengthCm: persistedInput.lengthCm,
              breadthCm: persistedInput.breadthCm,
              heightCm: persistedInput.heightCm,
            },
            events: {
              create: {
                status: "LABEL_CREATED",
                description: "Courier AWB assigned",
                source: provider.key,
                occurredAt: createdAt,
              },
            },
          },
        });
        return tx.courierBooking.update({
          where: { id: booking!.id },
          data: { shipmentId: shipment.id },
          include: { shipment: { include: { events: true } } },
        });
      });
    }

    if (!booking.labelUrl) {
      const label = await provider.generateLabel(booking.providerShipmentId!);
      booking = await prisma.$transaction(async (tx) => {
        await tx.shipment.update({
          where: { id: booking!.shipmentId! },
          data: { labelUrl: label.labelUrl },
        });
        return tx.courierBooking.update({
          where: { id: booking!.id },
          data: { labelUrl: label.labelUrl },
          include: { shipment: { include: { events: true } } },
        });
      });
    }

    const pickup = await provider.schedulePickup(
      booking.providerShipmentId!,
      persistedInput.pickupDate,
    );
    booking = await prisma.$transaction(async (tx) => {
      await tx.shipment.update({
        where: { id: booking!.shipmentId! },
        data: {
          pickupScheduledAt: pickup.pickupScheduledAt,
          syncError: null,
        },
      });
      return tx.courierBooking.update({
        where: { id: booking!.id },
        data: { status: "READY", error: null },
        include: {
          shipment: {
            include: { events: { orderBy: { occurredAt: "desc" } } },
          },
        },
      });
    });
    return booking;
  } catch (error) {
    const message = errorMessage(error);
    await prisma.courierBooking.update({
      where: { id: booking.id },
      data: { status: "FAILED", error: message },
    });
    if (booking.shipmentId) {
      await prisma.shipment.update({
        where: { id: booking.shipmentId },
        data: { syncError: message },
      });
    }
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, "courier_booking_failed", message);
  }
}

export async function getCourierRatesForOrder(
  orderId: string,
  rawInput: CourierBookingInput,
) {
  const provider = getConfiguredCourierProvider();
  const input = courierBookingSchema.parse(rawInput);
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      status: true,
      paymentMethod: true,
      total: true,
      addressSnapshot: true,
    },
  });
  if (!order) {
    throw new HttpError(404, "order_not_found", "Order not found");
  }
  if (!["PAID", "CONFIRMED"].includes(order.status)) {
    throw new HttpError(
      409,
      "order_not_bookable",
      `Courier rates are not available for ${order.status} orders`,
    );
  }
  const address = parseAddress(order.addressSnapshot);
  return provider.getRates({
    deliveryPincode: address.pincode,
    paymentMethod: order.paymentMethod,
    orderValue: order.total,
    parcel: input,
  });
}

export async function cancelCourierShipment(shipmentId: string) {
  const provider = getConfiguredCourierProvider();
  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    include: { courierBooking: true },
  });
  if (!shipment) {
    throw new HttpError(404, "shipment_not_found", "Shipment not found");
  }
  if (shipment.provider !== provider.key || !shipment.courierBooking) {
    throw new HttpError(
      409,
      "shipment_not_provider_managed",
      "This shipment is not managed by the configured courier",
    );
  }
  if (!["LABEL_CREATED", "DELIVERY_FAILED"].includes(shipment.status)) {
    throw new HttpError(
      409,
      "shipment_not_cancellable",
      `Cannot cancel a shipment in ${shipment.status} status`,
    );
  }

  await provider.cancelShipment(shipment.trackingNumber);
  await prisma.$transaction(async (tx) => {
    await tx.shipment.update({
      where: { id: shipment.id },
      data: { status: "CANCELLED", syncError: null },
    });
    await tx.shipmentEvent.create({
      data: {
        shipmentId: shipment.id,
        status: "CANCELLED",
        description: "Shipment cancelled with courier",
        source: provider.key,
      },
    });
    await tx.courierBooking.update({
      where: { id: shipment.courierBooking!.id },
      data: { status: "CANCELLED", error: null },
    });
  });
}
