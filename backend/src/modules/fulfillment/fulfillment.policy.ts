import { z } from "zod";
import type { ShipmentStatus } from "@prisma/client";

/**
 * Courier providers retry and occasionally deliver scans out of order. Keep
 * the canonical shipment state monotonic while still retaining every scan in
 * ShipmentEvent for support/audit purposes. Delivery failures may recover
 * into another attempt; delivered, returned and cancelled are terminal.
 */
export const SHIPMENT_TRANSITIONS: Record<
  ShipmentStatus,
  readonly ShipmentStatus[]
> = {
  LABEL_CREATED: [
    "PICKED_UP",
    "IN_TRANSIT",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "DELIVERY_FAILED",
    "CANCELLED",
  ],
  PICKED_UP: ["IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "DELIVERY_FAILED"],
  IN_TRANSIT: [
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "DELIVERY_FAILED",
    "RTO_IN_TRANSIT",
  ],
  OUT_FOR_DELIVERY: ["DELIVERED", "DELIVERY_FAILED"],
  DELIVERY_FAILED: [
    "PICKED_UP",
    "IN_TRANSIT",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "RTO_IN_TRANSIT",
    "RETURNED",
  ],
  RTO_IN_TRANSIT: ["RETURNED"],
  DELIVERED: [],
  RETURNED: [],
  CANCELLED: [],
} as const;

export function canShipmentTransition(
  from: ShipmentStatus,
  to: ShipmentStatus,
): boolean {
  return from === to || SHIPMENT_TRANSITIONS[from].includes(to);
}

const httpUrl = z
  .string()
  .trim()
  .url()
  .max(2048)
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "Tracking URL must use http or https");

export const manualShipmentSchema = z.object({
  carrier: z.string().trim().min(2).max(80),
  service: z.string().trim().min(1).max(80).optional(),
  trackingNumber: z
    .string()
    .trim()
    .min(3)
    .max(100)
    .regex(
      /^[A-Za-z0-9][A-Za-z0-9._/-]*$/,
      "Tracking number contains unsupported characters",
    ),
  trackingUrl: httpUrl.optional(),
  estimatedDeliveryAt: z.coerce.date().optional(),
  note: z.string().trim().max(500).optional(),
});

export type ManualShipmentInput = z.infer<typeof manualShipmentSchema>;

export const courierBookingSchema = z.object({
  weightKg: z.number().positive().min(0.05).max(100),
  lengthCm: z.number().positive().min(1).max(300),
  breadthCm: z.number().positive().min(1).max(300),
  heightCm: z.number().positive().min(1).max(300),
  courierId: z.string().trim().regex(/^\d+$/).max(20).optional(),
  pickupDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export type CourierBookingInput = z.infer<typeof courierBookingSchema>;

const SHIPROCKET_STATUS_MAP: Record<
  string,
  import("@prisma/client").ShipmentStatus
> = {
  NEW: "LABEL_CREATED",
  "AWB ASSIGNED": "LABEL_CREATED",
  "READY TO SHIP": "LABEL_CREATED",
  "PICKUP SCHEDULED": "LABEL_CREATED",
  "PICKUP BOOKED": "LABEL_CREATED",
  "PICKUP RESCHEDULED": "LABEL_CREATED",
  "OUT FOR PICKUP": "LABEL_CREATED",
  "SHIPMENT BOOKED": "LABEL_CREATED",
  "PICKED UP": "PICKED_UP",
  "PICKUP DONE": "PICKED_UP",
  "HANDOVER TO COURIER": "PICKED_UP",
  SHIPPED: "IN_TRANSIT",
  "IN TRANSIT": "IN_TRANSIT",
  "REACHED AT DESTINATION": "IN_TRANSIT",
  "REACHED AT DESTINATION HUB": "IN_TRANSIT",
  DELAYED: "IN_TRANSIT",
  "OUT FOR DELIVERY": "OUT_FOR_DELIVERY",
  DELIVERED: "DELIVERED",
  UNDELIVERED: "DELIVERY_FAILED",
  NDR: "DELIVERY_FAILED",
  "DELIVERY FAILED": "DELIVERY_FAILED",
  LOST: "DELIVERY_FAILED",
  DAMAGED: "DELIVERY_FAILED",
  "PARTIAL DELIVERED": "DELIVERY_FAILED",
  "PICKUP ERROR": "DELIVERY_FAILED",
  "PICKUP EXCEPTION": "DELIVERY_FAILED",
  "RTO INITIATED": "RTO_IN_TRANSIT",
  "RTO IN TRANSIT": "RTO_IN_TRANSIT",
  "RTO DELIVERED": "RETURNED",
  RETURNED: "RETURNED",
  CANCELED: "CANCELLED",
  CANCELLED: "CANCELLED",
};

export function normalizeShiprocketStatus(value: string) {
  const normalized = value
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .toUpperCase();
  return SHIPROCKET_STATUS_MAP[normalized] ?? null;
}
