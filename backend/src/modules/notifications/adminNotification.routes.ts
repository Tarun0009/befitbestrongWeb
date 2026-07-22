import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/db.js";
import { HttpError } from "../../middleware/errorHandler.js";

const router = Router();

router.get("/notifications", async (req, res, next) => {
  try {
    const query = z
      .object({
        limit: z.coerce.number().int().positive().max(100).default(20),
        unreadOnly: z.enum(["true", "false"]).default("false"),
      })
      .strict()
      .parse(req.query);
    const userId = req.auth!.userId;
    const unreadWhere = { receipts: { none: { userId } } };

    const [notifications, unreadCount] = await Promise.all([
      prisma.adminNotification.findMany({
        where: query.unreadOnly === "true" ? unreadWhere : undefined,
        orderBy: { createdAt: "desc" },
        take: query.limit,
        include: {
          receipts: {
            where: { userId },
            select: { readAt: true },
          },
          order: {
            select: {
              status: true,
              paymentMethod: true,
              total: true,
              currency: true,
              contactEmail: true,
            },
          },
        },
      }),
      prisma.adminNotification.count({ where: unreadWhere }),
    ]);

    res.json({
      items: notifications.map(({ receipts, ...notification }) => ({
        ...notification,
        readAt: receipts[0]?.readAt ?? null,
      })),
      unreadCount,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/notifications/read-all", async (req, res, next) => {
  try {
    const userId = req.auth!.userId;
    const unread = await prisma.adminNotification.findMany({
      where: { receipts: { none: { userId } } },
      select: { id: true },
      take: 500,
    });
    if (unread.length) {
      await prisma.adminNotificationReceipt.createMany({
        data: unread.map((notification) => ({
          notificationId: notification.id,
          userId,
        })),
        skipDuplicates: true,
      });
    }
    res.json({ read: unread.length });
  } catch (err) {
    next(err);
  }
});

router.post("/notifications/:id/read", async (req, res, next) => {
  try {
    const id = z.string().cuid().parse(req.params.id);
    const exists = await prisma.adminNotification.count({ where: { id } });
    if (!exists) {
      throw new HttpError(404, "notification_not_found", "Notification not found");
    }

    const receipt = await prisma.adminNotificationReceipt.upsert({
      where: {
        notificationId_userId: {
          notificationId: id,
          userId: req.auth!.userId,
        },
      },
      update: { readAt: new Date() },
      create: {
        notificationId: id,
        userId: req.auth!.userId,
      },
    });
    res.json({ receipt });
  } catch (err) {
    next(err);
  }
});

export default router;

