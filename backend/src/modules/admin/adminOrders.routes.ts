import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/db.js";
import { HttpError } from "../../middleware/errorHandler.js";
import { transition, TRANSITIONS } from "../orders/stateMachine.js";
import { Prisma, type OrderStatus } from "@prisma/client";
import { manualShipmentSchema } from "../fulfillment/fulfillment.policy.js";
import {
  createManualShipment,
  markOpenShipmentsDelivered,
} from "../fulfillment/fulfillment.service.js";
import {
  getRefundSummary,
  reconcileRefundIntent,
  requestRefund,
  summarizeRefundState,
} from "../refunds/refund.service.js";

const router = Router();

const ORDER_STATUSES: OrderStatus[] = [
  "PENDING",
  "CONFIRMED",
  "PAID",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "FAILED",
  "REFUNDED",
];

router.get("/orders", async (req, res, next) => {
  try {
    const q = z
      .object({
        page: z.coerce.number().int().positive().default(1),
        limit: z.coerce.number().int().positive().max(100).default(20),
        status: z.enum(ORDER_STATUSES as [OrderStatus, ...OrderStatus[]]).optional(),
      })
      .strict()
      .parse(req.query);

    const where = q.status ? { status: q.status } : {};
    const [items, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        select: {
          id: true,
          status: true,
          paymentMethod: true,
          total: true,
          currency: true,
          createdAt: true,
          contactEmail: true,
          user: { select: { id: true, email: true, name: true } },
          _count: { select: { items: true } },
        },
      }),
      prisma.order.count({ where }),
    ]);

    res.json({
      items,
      total,
      page: q.page,
      limit: q.limit,
      totalPages: Math.max(1, Math.ceil(total / q.limit)),
    });
  } catch (err) {
    next(err);
  }
});

router.get("/orders/:id", async (req, res, next) => {
  try {
    const id = z.string().cuid().parse(req.params.id);
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        items: true,
        payment: { select: { id: true, provider: true, providerOrderId: true, providerPaymentId: true, amount: true, currency: true, status: true, createdAt: true, updatedAt: true } },
        user: { select: { id: true, email: true, name: true } },
        history: { orderBy: { createdAt: "desc" } },
        shipments: {
          orderBy: { createdAt: "desc" },
          include: { events: { orderBy: { occurredAt: "desc" } } },
        },
        refundIntents: {
          orderBy: { createdAt: "desc" },
          include: { events: { orderBy: { createdAt: "desc" } } },
        },
      },
    });
    if (!order) throw new HttpError(404, "order_not_found", "Order not found");
    const { guestAccessTokenHash: _guestAccessTokenHash, ...safeOrder } = order;
    res.json({
      order: safeOrder,
      refundSummary: summarizeRefundState({
        orderStatus: order.status,
        payment: order.payment,
        intents: order.refundIntents,
      }),
      allowedTransitions: TRANSITIONS[order.status].filter(
        (status) => status !== "REFUNDED",
      ),
    });
  } catch (err) {
    next(err);
  }
});

const noteBody = z.object({
  note: z.string().trim().max(500).optional(),
}).strict();

router.post("/orders/:id/shipments", async (req, res, next) => {
  try {
    const id = z.string().cuid().parse(req.params.id);
    const input = manualShipmentSchema.parse(req.body);
    const trackingNumber = input.trackingNumber.toUpperCase();

    const order = await prisma.order.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!order) {
      throw new HttpError(404, "order_not_found", "Order not found");
    }
    if (!["PAID", "CONFIRMED", "SHIPPED"].includes(order.status)) {
      throw new HttpError(
        409,
        "order_not_dispatchable",
        `Cannot dispatch an order in ${order.status} status`,
      );
    }

    await transition(prisma, id, "SHIPPED", {
      actor: {
        kind: "admin",
        userId: req.auth!.userId,
        note: input.note || `Dispatched with ${input.carrier}`,
      },
      transactionWork: async (tx) => {
        await createManualShipment(tx, id, req.auth!.userId, {
          ...input,
          trackingNumber,
        });
      },
    });

    const shipment = await prisma.shipment.findUniqueOrThrow({
      where: {
        carrier_trackingNumber: {
          carrier: input.carrier,
          trackingNumber,
        },
      },
      include: { events: { orderBy: { occurredAt: "desc" } } },
    });
    res.status(201).json({
      shipment,
      order: { id, status: "SHIPPED" as const },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      next(
        new HttpError(
          409,
          "tracking_number_exists",
          "This carrier and tracking number are already in use",
        ),
      );
      return;
    }
    next(err);
  }
});

async function adminTransition(
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction,
  to: OrderStatus,
) {
  try {
    const id = z.string().cuid().parse(req.params.id);
    const { note } = noteBody.parse(req.body ?? {});
    const updated = await transition(prisma, id, to, {
      actor: {
        kind: "admin",
        userId: req.auth!.userId,
        note,
      },
      transactionWork:
        to === "DELIVERED"
          ? (tx) => markOpenShipmentsDelivered(tx, id, note)
          : undefined,
    });
    res.json({ order: updated });
  } catch (err) {
    next(err);
  }
}

router.post("/orders/:id/ship", (req, res, next) =>
  adminTransition(req, res, next, "SHIPPED"),
);
router.post("/orders/:id/deliver", (req, res, next) =>
  adminTransition(req, res, next, "DELIVERED"),
);
router.post("/orders/:id/cancel", (req, res, next) =>
  adminTransition(req, res, next, "CANCELLED"),
);
const refundBody = z.object({
  amount: z.number().int().positive(),
  reason: z.string().trim().min(3).max(500),
}).strict();

router.post("/orders/:id/refunds", async (req, res, next) => {
  try {
    const orderId = z.string().cuid().parse(req.params.id);
    const idempotencyKey = req.header("idempotency-key")?.trim();
    if (!idempotencyKey || idempotencyKey.length < 16 || idempotencyKey.length > 128) {
      throw new HttpError(
        400,
        "idempotency_key_required",
        "Idempotency-Key must contain 16 to 128 characters",
      );
    }
    const body = refundBody.parse(req.body);
    const result = await requestRefund({
      orderId,
      requestedById: req.auth!.userId,
      idempotencyKey,
      amount: body.amount,
      reason: body.reason,
    });
    res.status(202).json(result);
  } catch (err) {
    next(err);
  }
});

router.post("/refunds/:id/reconcile", async (req, res, next) => {
  try {
    const id = z.string().cuid().parse(req.params.id);
    const intent = await reconcileRefundIntent(id);
    const result = await getRefundSummary(intent.orderId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
