import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/db.js";
import { HttpError } from "../../middleware/errorHandler.js";
import { transition, TRANSITIONS } from "../orders/stateMachine.js";
import type { OrderStatus } from "@prisma/client";

const router = Router();

const ORDER_STATUSES: OrderStatus[] = [
  "PENDING",
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
        payment: true,
        user: { select: { id: true, email: true, name: true } },
        history: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!order) throw new HttpError(404, "order_not_found", "Order not found");
    res.json({
      order,
      allowedTransitions: TRANSITIONS[order.status],
    });
  } catch (err) {
    next(err);
  }
});

const noteBody = z.object({
  note: z.string().max(500).optional(),
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
router.post("/orders/:id/refund", (req, res, next) =>
  adminTransition(req, res, next, "REFUNDED"),
);

export default router;


