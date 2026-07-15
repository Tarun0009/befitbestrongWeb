import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/db.js";
import { HttpError } from "../../middleware/errorHandler.js";
import { requireAtLeastOneField } from "../../lib/validation.js";

const router = Router();
const zoneSchema = z.enum(["DELHI", "NOIDA", "GHAZIABAD"]);
const pincodeSchema = z.string().trim().regex(/^\d{6}$/);

const areaFields = z.object({
    pincode: pincodeSchema,
    zone: zoneSchema,
    city: z.string().trim().min(2).max(100),
    state: z.string().trim().min(2).max(100),
    active: z.boolean().default(true),
    prepaidEnabled: z.boolean().default(true),
    codEnabled: z.boolean().default(true),
    codMaxOrderAmount: z.number().int().min(0).max(10_000_000).default(500_000),
    codFee: z.number().int().min(0).max(100_000).default(0),
    estimatedDeliveryMinDays: z.number().int().min(0).max(30).default(1),
    estimatedDeliveryMaxDays: z.number().int().min(0).max(45).default(3),
  });

const areaBody = areaFields.refine(
    (value) =>
      value.estimatedDeliveryMaxDays >= value.estimatedDeliveryMinDays,
    {
      message: "Maximum delivery days must be greater than or equal to minimum",
      path: ["estimatedDeliveryMaxDays"],
    },
  );
const areaPatchBody = requireAtLeastOneField(areaFields.partial().strict());

router.get("/service-areas", async (req, res, next) => {
  try {
    const query = z
      .object({
        page: z.coerce.number().int().positive().default(1),
        limit: z.coerce.number().int().positive().max(100).default(50),
        zone: zoneSchema.optional(),
        active: z.enum(["true", "false"]).optional(),
        search: z.string().trim().max(100).optional(),
      })
      .parse(req.query);

    const where = {
      ...(query.zone ? { zone: query.zone } : {}),
      ...(query.active ? { active: query.active === "true" } : {}),
      ...(query.search
        ? {
            OR: [
              { pincode: { contains: query.search } },
              { city: { contains: query.search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.serviceArea.findMany({
        where,
        orderBy: [{ zone: "asc" }, { pincode: "asc" }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.serviceArea.count({ where }),
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

router.post("/service-areas", async (req, res, next) => {
  try {
    const body = areaBody.parse(req.body);
    const area = await prisma.serviceArea.create({ data: body });
    res.status(201).json({ area });
  } catch (err) {
    next(err);
  }
});

router.patch("/service-areas/:id", async (req, res, next) => {
  try {
    const id = z.string().cuid().parse(req.params.id);
    const current = await prisma.serviceArea.findUnique({ where: { id } });
    if (!current) {
      throw new HttpError(404, "service_area_not_found", "Service area not found");
    }

    const patch = areaPatchBody.parse(req.body);
    areaBody.parse({ ...current, ...patch });
    const area = await prisma.serviceArea.update({
      where: { id },
      // Cross-field rules are checked against the merged resource above, while
      // Prisma writes only the fields the admin actually changed.
      data: patch,
    });
    res.json({ area });
  } catch (err) {
    next(err);
  }
});

router.get("/service-area-demand", async (req, res, next) => {
  try {
    const query = z
      .object({
        page: z.coerce.number().int().positive().default(1),
        limit: z.coerce.number().int().positive().max(100).default(30),
      })
      .parse(req.query);

    const grouped = await prisma.serviceAreaRequest.groupBy({
      by: ["pincode"],
      _count: { _all: true },
      _sum: { attemptCount: true },
      _max: { lastRequestedAt: true },
      orderBy: { _sum: { attemptCount: "desc" } },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    const totalRows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(DISTINCT "pincode")::bigint AS "count"
      FROM "ServiceAreaRequest"
    `;

    res.json({
      items: grouped.map((item) => ({
        pincode: item.pincode,
        uniqueRequesters: item._count._all,
        requestAttempts: item._sum.attemptCount ?? 0,
        lastRequestedAt: item._max.lastRequestedAt,
      })),
      total: Number(totalRows[0]?.count ?? 0),
      page: query.page,
      limit: query.limit,
    });
  } catch (err) {
    next(err);
  }
});

export default router;


