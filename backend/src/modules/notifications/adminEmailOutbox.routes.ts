import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/db.js";
import { env } from "../../config/env.js";
import { retryEmailOutbox } from "./emailOutbox.service.js";

const router = Router();

const statuses = [
  "PENDING",
  "PROCESSING",
  "SENT",
  "DEAD_LETTER",
  "CANCELLED",
] as const;
const templates = [
  "ORDER_STATUS",
  "ADMIN_ORDER_ALERT",
  "ACCOUNT_SECURITY",
  "EMAIL_CHANGE_CONFIRMATION",
  "SUBSCRIPTION_RENEWAL",
  "BACK_IN_STOCK",
] as const;

router.get("/email-outbox", async (req, res, next) => {
  try {
    const query = z
      .object({
        page: z.coerce.number().int().positive().default(1),
        limit: z.coerce.number().int().positive().max(100).default(25),
        status: z.enum(statuses).optional(),
        template: z.enum(templates).optional(),
      })
      .strict()
      .parse(req.query);
    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.template ? { template: query.template } : {}),
    };
    const [items, total, grouped, oldestPending] = await Promise.all([
      prisma.emailOutbox.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          template: true,
          recipientEmail: true,
          subject: true,
          referenceType: true,
          referenceId: true,
          status: true,
          attemptCount: true,
          maxAttempts: true,
          nextAttemptAt: true,
          lastAttemptAt: true,
          providerMessageId: true,
          lastErrorCode: true,
          lastErrorMessage: true,
          sentAt: true,
          deadLetteredAt: true,
          createdAt: true,
          updatedAt: true,
          events: {
            orderBy: { createdAt: "desc" },
            take: 5,
            select: {
              id: true,
              fromStatus: true,
              toStatus: true,
              source: true,
              message: true,
              createdAt: true,
            },
          },
        },
      }),
      prisma.emailOutbox.count({ where }),
      prisma.emailOutbox.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      prisma.emailOutbox.aggregate({
        where: { status: { in: ["PENDING", "PROCESSING"] } },
        _min: { createdAt: true },
      }),
    ]);
    const summary = Object.fromEntries(
      statuses.map((status) => [status, 0]),
    ) as Record<(typeof statuses)[number], number>;
    for (const row of grouped) summary[row.status] = row._count._all;
    res.json({
      items,
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
      summary: {
        ...summary,
        configured: Boolean(env.RESEND_API_KEY && env.EMAIL_FROM),
        oldestPendingAt: oldestPending._min.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post("/email-outbox/:id/retry", async (req, res, next) => {
  try {
    const id = z.string().cuid().parse(req.params.id);
    const email = await retryEmailOutbox(id, req.auth!.userId);
    res.status(202).json({
      email: {
        id: email.id,
        status: email.status,
        nextAttemptAt: email.nextAttemptAt,
        updatedAt: email.updatedAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
