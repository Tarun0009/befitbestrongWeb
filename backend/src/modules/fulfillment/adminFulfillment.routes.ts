import { Router } from "express";
import { z } from "zod";
import { ShipmentStatus } from "@prisma/client";
import { prisma } from "../../config/db.js";
import { HttpError } from "../../middleware/errorHandler.js";
import { reconcileShipment } from "../../jobs/courierEvents.js";
import {
  bookOrderWithCourier,
  cancelCourierShipment,
  getCourierRatesForOrder,
} from "./courierBooking.service.js";
import { courierConfiguration } from "./courier.registry.js";
import { courierBookingSchema } from "./fulfillment.policy.js";

const router = Router();

router.get("/fulfillment/config", (_req, res) => {
  res.json(courierConfiguration());
});

router.post("/orders/:id/courier-booking", async (req, res, next) => {
  try {
    const id = z.string().cuid().parse(req.params.id);
    const input = courierBookingSchema.parse(req.body);
    const booking = await bookOrderWithCourier(
      id,
      req.auth!.userId,
      input,
    );
    res.status(201).json({ booking });
  } catch (error) {
    next(error);
  }
});

router.post("/orders/:id/courier-rates", async (req, res, next) => {
  try {
    const id = z.string().cuid().parse(req.params.id);
    const input = courierBookingSchema.parse(req.body);
    const items = await getCourierRatesForOrder(id, input);
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

router.get("/fulfillment/shipments", async (req, res, next) => {
  try {
    const query = z
      .object({
        page: z.coerce.number().int().positive().default(1),
        limit: z.coerce.number().int().positive().max(100).default(25),
        status: z.nativeEnum(ShipmentStatus).optional(),
        provider: z.string().trim().min(1).max(50).optional(),
      })
      .parse(req.query);
    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.provider ? { provider: query.provider } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.shipment.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          provider: true,
          carrier: true,
          service: true,
          trackingNumber: true,
          trackingUrl: true,
          labelUrl: true,
          status: true,
          estimatedDeliveryAt: true,
          pickupScheduledAt: true,
          shippedAt: true,
          deliveredAt: true,
          lastSyncedAt: true,
          syncError: true,
          createdAt: true,
          updatedAt: true,
          order: {
            select: {
              id: true,
              status: true,
              paymentMethod: true,
              contactEmail: true,
              total: true,
              currency: true,
            },
          },
          courierBooking: {
            select: {
              id: true,
              status: true,
              attemptCount: true,
              error: true,
            },
          },
          events: {
            orderBy: { occurredAt: "desc" },
            take: 1,
            select: {
              id: true,
              status: true,
              description: true,
              location: true,
              occurredAt: true,
            },
          },
        },
      }),
      prisma.shipment.count({ where }),
    ]);
    res.json({
      items,
      total,
      page: query.page,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/shipments/:id/reconcile", async (req, res, next) => {
  try {
    const id = z.string().cuid().parse(req.params.id);
    const shipment = await prisma.shipment.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!shipment) {
      throw new HttpError(404, "shipment_not_found", "Shipment not found");
    }
    const result = await reconcileShipment(id);
    res.json({ result });
  } catch (error) {
    next(error);
  }
});

router.post("/shipments/:id/cancel", async (req, res, next) => {
  try {
    const id = z.string().cuid().parse(req.params.id);
    await cancelCourierShipment(id);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;
