import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/db.js";
import { requireAuth } from "../../middleware/auth.js";
import { optionalAuth } from "../../middleware/optionalAuth.js";
import { HttpError } from "../../middleware/errorHandler.js";
import { hashGuestToken } from "../checkout/checkout.service.js";

const router = Router();

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const query = z
      .object({
        page: z.coerce.number().int().positive().default(1),
        limit: z.coerce.number().int().positive().max(50).default(10),
      })
      .parse(req.query);

    const where = { userId: req.auth!.userId };
    const [items, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          status: true,
          paymentMethod: true,
          total: true,
          currency: true,
          createdAt: true,
          items: {
            select: {
              id: true,
              quantity: true,
              productSnapshot: true,
            },
          },
        },
      }),
      prisma.order.count({ where }),
    ]);

    res.json({
      items,
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    });
  } catch (err) {
    next(err);
  }
});

router.get("/:id", optionalAuth, async (req, res, next) => {
  try {
    const id = z.string().cuid().parse(req.params.id);
    const guestAccessToken = req.header("X-Guest-Order-Token");

    const access = [
      ...(req.auth ? [{ userId: req.auth.userId }] : []),
      ...(guestAccessToken
        ? [{ guestAccessTokenHash: hashGuestToken(guestAccessToken) }]
        : []),
    ];
    if (access.length === 0) {
      throw new HttpError(401, "order_access_required", "Order access required");
    }

    const order = await prisma.order.findFirst({
      where: { id, OR: access },
      include: {
        items: true,
        payment: {
          select: {
            provider: true,
            providerOrderId: true,
            providerPaymentId: true,
            status: true,
            amount: true,
            currency: true,
          },
        },
        history: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            fromStatus: true,
            toStatus: true,
            actorKind: true,
            note: true,
            createdAt: true,
          },
        },
        refundIntents: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            kind: true,
            amount: true,
            currency: true,
            reason: true,
            status: true,
            createdAt: true,
            processedAt: true,
          },
        },
        shipments: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            carrier: true,
            service: true,
            trackingNumber: true,
            trackingUrl: true,
            status: true,
            estimatedDeliveryAt: true,
            shippedAt: true,
            deliveredAt: true,
            events: {
              orderBy: { occurredAt: "desc" },
              select: {
                id: true,
                status: true,
                description: true,
                location: true,
                occurredAt: true,
              },
            },
          },
        },
      },
    });
    if (!order) {
      throw new HttpError(404, "order_not_found", "Order not found");
    }

    const {
      guestAccessTokenHash: _secret,
      refundIntents,
      ...safeOrder
    } = order;
    res.json({ order: { ...safeOrder, refunds: refundIntents } });
  } catch (err) {
    next(err);
  }
});

export default router;
