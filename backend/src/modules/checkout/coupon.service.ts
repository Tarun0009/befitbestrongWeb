import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/db.js";
import { HttpError } from "../../middleware/errorHandler.js";

export function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase();
}

export interface CalculatedCoupon {
  id: string;
  code: string;
  description: string | null;
  type: "PERCENTAGE" | "FIXED_AMOUNT";
  value: number;
  minSubtotal: number;
  maxDiscount: number | null;
  maxUses: number | null;
  usedCount: number;
  assignedUserId: string | null;
  source: string;
  discount: number;
  subtotal: number;
  total: number;
}

export async function calculateCouponDiscount(
  rawCode: string,
  subtotal: number,
  userId: string | null = null,
): Promise<CalculatedCoupon> {
  const code = normalizeCouponCode(rawCode);
  const coupon = await prisma.coupon.findUnique({ where: { code } });
  const now = new Date();

  if (!coupon || !coupon.active) {
    throw new HttpError(400, "coupon_invalid", "This coupon is not valid");
  }
  if (
    coupon.assignedUserId !== null &&
    coupon.assignedUserId !== userId
  ) {
    throw new HttpError(
      403,
      "coupon_not_assigned",
      "This reward coupon belongs to another account",
    );
  }
  if (
    coupon.maxUses !== null &&
    coupon.usedCount >= coupon.maxUses
  ) {
    throw new HttpError(
      409,
      "coupon_used",
      "This coupon has already been used",
    );
  }
  if (coupon.startsAt && coupon.startsAt > now) {
    throw new HttpError(400, "coupon_not_started", "This coupon is not active yet");
  }
  if (coupon.endsAt && coupon.endsAt < now) {
    throw new HttpError(400, "coupon_expired", "This coupon has expired");
  }
  if (subtotal < coupon.minSubtotal) {
    throw new HttpError(
      400,
      "coupon_minimum_not_met",
      "Add more items to meet this coupon's minimum order value",
    );
  }

  let discount =
    coupon.type === "PERCENTAGE"
      ? Math.floor((subtotal * coupon.value) / 100)
      : coupon.value;

  if (coupon.maxDiscount !== null) {
    discount = Math.min(discount, coupon.maxDiscount);
  }
  discount = Math.min(Math.max(discount, 0), subtotal);

  if (discount <= 0) {
    throw new HttpError(400, "coupon_invalid", "This coupon has no discount");
  }

  return {
    id: coupon.id,
    code: coupon.code,
    description: coupon.description,
    type: coupon.type,
    value: coupon.value,
    minSubtotal: coupon.minSubtotal,
    maxDiscount: coupon.maxDiscount,
    maxUses: coupon.maxUses,
    usedCount: coupon.usedCount,
    assignedUserId: coupon.assignedUserId,
    source: coupon.source,
    discount,
    subtotal,
    total: subtotal - discount,
  };
}

export async function consumeCouponUsage(
  tx: Prisma.TransactionClient,
  coupon: CalculatedCoupon,
): Promise<void> {
  if (coupon.maxUses === null) {
    await tx.coupon.update({
      where: { id: coupon.id },
      data: { usedCount: { increment: 1 } },
    });
    return;
  }

  const result = await tx.coupon.updateMany({
    where: {
      id: coupon.id,
      active: true,
      usedCount: { lt: coupon.maxUses },
    },
    data: { usedCount: { increment: 1 } },
  });
  if (result.count === 0) {
    throw new HttpError(
      409,
      "coupon_used",
      "This coupon has already been used",
    );
  }
}
