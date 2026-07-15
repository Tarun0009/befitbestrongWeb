import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/db.js";
import { HttpError } from "../../middleware/errorHandler.js";
import { normalizeCouponCode } from "../checkout/coupon.service.js";
import { requireAtLeastOneField } from "../../lib/validation.js";

const router = Router();

const couponFields = z.object({
  code: z.string().trim().min(2).max(32).regex(/^[A-Za-z0-9_-]+$/),
  description: z.string().trim().max(200).optional().nullable(),
  type: z.enum(["PERCENTAGE", "FIXED_AMOUNT"]),
  value: z.number().int().positive(),
  minSubtotal: z.number().int().nonnegative().default(0),
  maxDiscount: z.number().int().positive().optional().nullable(),
  startsAt: z.coerce.date().optional().nullable(),
  endsAt: z.coerce.date().optional().nullable(),
  active: z.boolean().default(true),
});
const couponPatchFields = requireAtLeastOneField(
  couponFields.partial().strict(),
);

function validateRules(value: {
  type?: "PERCENTAGE" | "FIXED_AMOUNT";
  value?: number;
  startsAt?: Date | null;
  endsAt?: Date | null;
}) {
  if (value.type === "PERCENTAGE" && value.value && value.value > 100) {
    throw new HttpError(400, "invalid_coupon", "Percentage cannot exceed 100");
  }
  if (value.startsAt && value.endsAt && value.startsAt >= value.endsAt) {
    throw new HttpError(
      400,
      "invalid_coupon_dates",
      "End date must be after start date",
    );
  }
}

router.get("/coupons", async (_req, res, next) => {
  try {
    const items = await prisma.coupon.findMany({
      where: { source: "MANUAL" },
      orderBy: { createdAt: "desc" },
    });
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

router.post("/coupons", async (req, res, next) => {
  try {
    const body = couponFields.parse(req.body);
    validateRules(body);
    const coupon = await prisma.coupon.create({
      data: {
        ...body,
        code: normalizeCouponCode(body.code),
      },
    });
    res.status(201).json({ coupon });
  } catch (err) {
    next(err);
  }
});

router.patch("/coupons/:id", async (req, res, next) => {
  try {
    const id = z.string().cuid().parse(req.params.id);
    const body = couponPatchFields.parse(req.body);
    validateRules(body);
    const coupon = await prisma.coupon.update({
      where: { id },
      data: {
        ...body,
        ...(body.code ? { code: normalizeCouponCode(body.code) } : {}),
      },
    });
    res.json({ coupon });
  } catch (err) {
    next(err);
  }
});

router.delete("/coupons/:id", async (req, res, next) => {
  try {
    const id = z.string().cuid().parse(req.params.id);
    await prisma.coupon.delete({ where: { id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;

