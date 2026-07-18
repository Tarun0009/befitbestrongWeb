import { Router } from "express";
import { Prisma, type Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../config/db.js";
import { HttpError } from "../../middleware/errorHandler.js";

const router = Router();

const listQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
  q: z.string().trim().max(120).optional(),
  role: z.enum(["CUSTOMER", "ADMIN"]).optional(),
});

const idParam = z.object({ id: z.string().cuid() });

router.get("/users", async (req, res, next) => {
  try {
    const query = listQuery.parse(req.query);
    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: query.role as Role } : {}),
      ...(query.q
        ? {
            OR: [
              { email: { contains: query.q, mode: "insensitive" } },
              { name: { contains: query.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              orders: true,
              wishlistItems: true,
              subscriptions: true,
            },
          },
        },
      }),
      prisma.user.count({ where }),
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

router.get("/users/:id", async (req, res, next) => {
  try {
    const { id } = idParam.parse(req.params);
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            orders: true,
            wishlistItems: true,
            subscriptions: true,
            reviews: true,
          },
        },
        orders: {
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            status: true,
            paymentMethod: true,
            total: true,
            currency: true,
            createdAt: true,
          },
        },
      },
    });
    if (!user) throw new HttpError(404, "user_not_found", "User not found");
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

export default router;
