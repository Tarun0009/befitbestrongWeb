import { randomBytes, randomUUID } from "node:crypto";
import {
  Prisma,
  type LoyaltyEntryType,
  type OrderStatus,
  type PaymentMethod,
} from "@prisma/client";
import { prisma } from "../../config/db.js";
import { HttpError } from "../../middleware/errorHandler.js";
import {
  calculateOrderPoints,
  calculateRedemptionDiscount,
} from "./loyaltyPolicy.js";

type LoyaltyTx = Prisma.TransactionClient;

interface LedgerInput {
  userId: string;
  type: LoyaltyEntryType;
  points: number;
  description: string;
  idempotencyKey: string;
  orderId?: string | null;
  couponCode?: string | null;
  referralId?: string | null;
  metadata?: Prisma.InputJsonValue;
  earnedDelta?: number;
  redeemedDelta?: number;
}

async function recordLedgerEntry(tx: LoyaltyTx, input: LedgerInput) {
  if (input.points === 0) return null;

  const existing = await tx.loyaltyEntry.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (existing) return existing;

  const entry = await tx.loyaltyEntry.create({
    data: {
      userId: input.userId,
      type: input.type,
      points: input.points,
      description: input.description,
      idempotencyKey: input.idempotencyKey,
      orderId: input.orderId ?? null,
      couponCode: input.couponCode ?? null,
      referralId: input.referralId ?? null,
      metadata: input.metadata,
    },
  });

  await tx.user.update({
    where: { id: input.userId },
    data: {
      pointsBalance: { increment: input.points },
      ...(input.earnedDelta
        ? { lifetimePointsEarned: { increment: input.earnedDelta } }
        : {}),
      ...(input.redeemedDelta
        ? { lifetimePointsRedeemed: { increment: input.redeemedDelta } }
        : {}),
    },
  });

  return entry;
}

function referralCodeFor(userId: string): string {
  return "BFS" + userId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

export async function ensureReferralCode(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { referralCode: true },
  });
  if (!user) {
    throw new HttpError(404, "user_not_found", "User not found");
  }
  if (user.referralCode) return user.referralCode;

  const referralCode = referralCodeFor(userId);
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { referralCode },
    select: { referralCode: true },
  });
  return updated.referralCode!;
}

export async function getLoyaltyAccount(userId: string) {
  const referralCode = await ensureReferralCode(userId);
  const [user, config, entries, receivedReferral, referralsMade] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          pointsBalance: true,
          lifetimePointsEarned: true,
          lifetimePointsRedeemed: true,
        },
      }),
      prisma.loyaltyConfig.upsert({
        where: { id: "main" },
        update: {},
        create: { id: "main" },
      }),
      prisma.loyaltyEntry.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          id: true,
          type: true,
          points: true,
          description: true,
          orderId: true,
          couponCode: true,
          createdAt: true,
        },
      }),
      prisma.referral.findUnique({
        where: { referredUserId: userId },
        select: {
          id: true,
          code: true,
          status: true,
          rewardedAt: true,
          referrer: { select: { name: true } },
        },
      }),
      prisma.referral.groupBy({
        by: ["status"],
        where: { referrerId: userId },
        _count: { _all: true },
      }),
    ]);

  if (!user) {
    throw new HttpError(404, "user_not_found", "User not found");
  }

  const referralCounts = new Map(
    referralsMade.map((row) => [row.status, row._count._all]),
  );

  return {
    account: {
      ...user,
      referralCode,
    },
    config: {
      enabled: config.enabled,
      earnPointsPerRupee: config.earnPointsPerRupee,
      redeemPointsPerRupee: config.redeemPointsPerRupee,
      minRedeemPoints: config.minRedeemPoints,
      maxRedeemPointsPerCoupon: config.maxRedeemPointsPerCoupon,
      referralBonusReferrer: config.referralBonusReferrer,
      referralBonusReferred: config.referralBonusReferred,
      couponValidityDays: config.couponValidityDays,
    },
    entries,
    receivedReferral,
    referrals: {
      total: referralsMade.reduce((sum, row) => sum + row._count._all, 0),
      pending: referralCounts.get("PENDING") ?? 0,
      rewarded: referralCounts.get("REWARDED") ?? 0,
      cancelled: referralCounts.get("CANCELLED") ?? 0,
    },
  };
}

export async function applyReferralCode(userId: string, rawCode: string) {
  const code = rawCode.trim().toUpperCase();
  const [user, referrer, existingReferral, paidOrders, config] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, referralCode: true },
      }),
      prisma.user.findUnique({
        where: { referralCode: code },
        select: { id: true, name: true, referralCode: true },
      }),
      prisma.referral.findUnique({
        where: { referredUserId: userId },
        select: { id: true },
      }),
      prisma.order.count({
        where: {
          userId,
          status: { in: ["PAID", "SHIPPED", "DELIVERED", "REFUNDED"] },
        },
      }),
      prisma.loyaltyConfig.upsert({
        where: { id: "main" },
        update: {},
        create: { id: "main" },
      }),
    ]);

  if (!config.enabled) {
    throw new HttpError(
      409,
      "loyalty_disabled",
      "The rewards program is currently paused",
    );
  }
  if (!user || !referrer) {
    throw new HttpError(400, "referral_invalid", "Referral code is not valid");
  }
  if (referrer.id === user.id || user.referralCode === code) {
    throw new HttpError(
      400,
      "referral_self",
      "You cannot use your own referral code",
    );
  }
  if (existingReferral) {
    throw new HttpError(
      409,
      "referral_already_applied",
      "A referral code has already been applied",
    );
  }
  if (paidOrders > 0) {
    throw new HttpError(
      409,
      "referral_too_late",
      "Referral codes must be applied before your first paid order",
    );
  }

  const referral = await prisma.referral.create({
    data: {
      referrerId: referrer.id,
      referredUserId: userId,
      code,
      status: "PENDING",
    },
    select: {
      id: true,
      code: true,
      status: true,
      referrer: { select: { name: true } },
    },
  });

  return { referral };
}

export async function redeemPoints(userId: string, points: number) {
  return prisma.$transaction(async (tx) => {
    const [config, user] = await Promise.all([
      tx.loyaltyConfig.upsert({
        where: { id: "main" },
        update: {},
        create: { id: "main" },
      }),
      tx.user.findUnique({
        where: { id: userId },
        select: { pointsBalance: true },
      }),
    ]);

    if (!config.enabled) {
      throw new HttpError(
        409,
        "loyalty_disabled",
        "The rewards program is currently paused",
      );
    }
    if (!user) {
      throw new HttpError(404, "user_not_found", "User not found");
    }
    if (points < config.minRedeemPoints) {
      throw new HttpError(
        400,
        "redemption_minimum",
        "Redeem at least " + config.minRedeemPoints + " points",
      );
    }
    if (
      config.maxRedeemPointsPerCoupon !== null &&
      points > config.maxRedeemPointsPerCoupon
    ) {
      throw new HttpError(
        400,
        "redemption_maximum",
        "This redemption exceeds the configured maximum",
      );
    }

    const discount = calculateRedemptionDiscount(
      points,
      config.redeemPointsPerRupee,
    );
    if (discount <= 0) {
      throw new HttpError(
        400,
        "redemption_increment",
        "Points must be a multiple of " + config.redeemPointsPerRupee,
      );
    }

    const code =
      "BFS-REWARD-" + randomBytes(5).toString("hex").toUpperCase();
    const expiresAt = new Date(
      Date.now() + config.couponValidityDays * 24 * 60 * 60 * 1000,
    );
    const coupon = await tx.coupon.create({
      data: {
        code,
        description: points + " reward points redeemed",
        type: "FIXED_AMOUNT",
        value: discount,
        minSubtotal: discount,
        active: true,
        maxUses: 1,
        usedCount: 0,
        assignedUserId: userId,
        source: "LOYALTY",
        endsAt: expiresAt,
      },
    });

    await tx.loyaltyEntry.create({
      data: {
        userId,
        type: "COUPON_REDEMPTION",
        points: -points,
        couponCode: code,
        description: "Redeemed " + points + " points for " + code,
        idempotencyKey: "loyalty:redeem:" + coupon.id,
        metadata: {
          discount,
          expiresAt: expiresAt.toISOString(),
        },
      },
    });

    const balanceUpdate = await tx.user.updateMany({
      where: {
        id: userId,
        pointsBalance: { gte: points },
      },
      data: {
        pointsBalance: { decrement: points },
        lifetimePointsRedeemed: { increment: points },
      },
    });
    if (balanceUpdate.count === 0) {
      throw new HttpError(
        409,
        "insufficient_points",
        "You do not have enough points",
      );
    }

    return {
      coupon: {
        code: coupon.code,
        discount,
        points,
        expiresAt,
      },
    };
  });
}

async function rewardOrder(
  tx: LoyaltyTx,
  input: { orderId: string; userId: string; total: number },
) {
  const config = await tx.loyaltyConfig.upsert({
    where: { id: "main" },
    update: {},
    create: { id: "main" },
  });
  if (!config.enabled) return;

  const points = calculateOrderPoints(
    input.total,
    config.earnPointsPerRupee,
  );
  if (points > 0) {
    await recordLedgerEntry(tx, {
      userId: input.userId,
      type: "ORDER_EARN",
      points,
      orderId: input.orderId,
      description: "Points earned from order " + input.orderId,
      idempotencyKey: "loyalty:order:earn:" + input.orderId,
      earnedDelta: points,
    });
  }

  const referral = await tx.referral.findUnique({
    where: { referredUserId: input.userId },
  });
  if (!referral || referral.status !== "PENDING") return;

  const referrerBonus = config.referralBonusReferrer;
  const referredBonus = config.referralBonusReferred;

  if (referrerBonus > 0) {
    await recordLedgerEntry(tx, {
      userId: referral.referrerId,
      type: "REFERRAL_BONUS",
      points: referrerBonus,
      referralId: referral.id,
      orderId: input.orderId,
      description: "Referral reward for a first paid order",
      idempotencyKey:
        "loyalty:referral:referrer:" + referral.id,
      earnedDelta: referrerBonus,
    });
  }
  if (referredBonus > 0) {
    await recordLedgerEntry(tx, {
      userId: referral.referredUserId,
      type: "REFERRAL_BONUS",
      points: referredBonus,
      referralId: referral.id,
      orderId: input.orderId,
      description: "Welcome referral reward",
      idempotencyKey:
        "loyalty:referral:referred:" + referral.id,
      earnedDelta: referredBonus,
    });
  }

  await tx.referral.update({
    where: { id: referral.id },
    data: {
      status: "REWARDED",
      qualifyingOrderId: input.orderId,
      referrerBonus,
      referredBonus,
      rewardedAt: new Date(),
    },
  });
}

async function reverseOrderRewards(
  tx: LoyaltyTx,
  input: { orderId: string; userId: string },
) {
  const earned = await tx.loyaltyEntry.findUnique({
    where: {
      idempotencyKey: "loyalty:order:earn:" + input.orderId,
    },
  });
  if (earned && earned.points > 0) {
    const reversed = await tx.loyaltyEntry.aggregate({
      where: { orderId: input.orderId, type: "ORDER_REFUND_REVERSAL" },
      _sum: { points: true },
    });
    const alreadyReversed = Math.abs(Math.min(0, reversed._sum.points ?? 0));
    const remaining = Math.max(0, earned.points - alreadyReversed);
    await recordLedgerEntry(tx, {
      userId: input.userId,
      type: "ORDER_REFUND_REVERSAL",
      points: -remaining,
      orderId: input.orderId,
      description: "Order points reversed after refund",
      idempotencyKey:
        "loyalty:order:refund:" + input.orderId,
      earnedDelta: -remaining,
    });
  }

  const referral = await tx.referral.findFirst({
    where: {
      qualifyingOrderId: input.orderId,
      status: "REWARDED",
    },
  });
  if (!referral) return;

  if ((referral.referrerBonus ?? 0) > 0) {
    await recordLedgerEntry(tx, {
      userId: referral.referrerId,
      type: "REFERRAL_REVERSAL",
      points: -referral.referrerBonus!,
      referralId: referral.id,
      orderId: input.orderId,
      description: "Referral reward reversed after refund",
      idempotencyKey:
        "loyalty:referral:reverse:referrer:" + referral.id,
      earnedDelta: -referral.referrerBonus!,
    });
  }
  if ((referral.referredBonus ?? 0) > 0) {
    await recordLedgerEntry(tx, {
      userId: referral.referredUserId,
      type: "REFERRAL_REVERSAL",
      points: -referral.referredBonus!,
      referralId: referral.id,
      orderId: input.orderId,
      description: "Referral welcome reward reversed after refund",
      idempotencyKey:
        "loyalty:referral:reverse:referred:" + referral.id,
      earnedDelta: -referral.referredBonus!,
    });
  }

  await tx.referral.update({
    where: { id: referral.id },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
    },
  });
}

export async function handlePartialRefundLoyalty(
  tx: LoyaltyTx,
  input: {
    orderId: string;
    userId: string | null;
    refundIntentId: string;
    cumulativeRefundedAmount: number;
    paymentAmount: number;
  },
) {
  if (!input.userId || input.paymentAmount <= 0) return;
  const earned = await tx.loyaltyEntry.findUnique({
    where: { idempotencyKey: "loyalty:order:earn:" + input.orderId },
  });
  if (!earned || earned.points <= 0) return;

  const targetReversal = Math.floor(
    (earned.points * input.cumulativeRefundedAmount) / input.paymentAmount,
  );
  const reversed = await tx.loyaltyEntry.aggregate({
    where: { orderId: input.orderId, type: "ORDER_REFUND_REVERSAL" },
    _sum: { points: true },
  });
  const alreadyReversed = Math.abs(Math.min(0, reversed._sum.points ?? 0));
  const delta = Math.max(0, targetReversal - alreadyReversed);
  if (delta === 0) return;

  await recordLedgerEntry(tx, {
    userId: input.userId,
    type: "ORDER_REFUND_REVERSAL",
    points: -delta,
    orderId: input.orderId,
    description: "Points adjusted for partial refund",
    idempotencyKey: "loyalty:order:partial-refund:" + input.refundIntentId,
    metadata: {
      refundIntentId: input.refundIntentId,
      cumulativeRefundedAmount: input.cumulativeRefundedAmount,
      paymentAmount: input.paymentAmount,
    },
    earnedDelta: -delta,
  });
}

async function restoreRedemption(
  tx: LoyaltyTx,
  input: {
    orderId: string;
    userId: string;
    couponCode: string | null;
  },
) {
  if (!input.couponCode) return;

  const redemption = await tx.loyaltyEntry.findFirst({
    where: {
      userId: input.userId,
      type: "COUPON_REDEMPTION",
      couponCode: input.couponCode,
    },
  });
  if (!redemption || redemption.points >= 0) return;

  const points = Math.abs(redemption.points);
  await recordLedgerEntry(tx, {
    userId: input.userId,
    type: "REDEMPTION_RESTORE",
    points,
    orderId: input.orderId,
    couponCode: input.couponCode,
    description: "Reward points restored from order " + input.orderId,
    idempotencyKey:
      "loyalty:redemption:restore:" +
      input.orderId +
      ":" +
      input.couponCode,
    redeemedDelta: -points,
  });
}

export async function handleLoyaltyTransition(
  tx: LoyaltyTx,
  input: {
    orderId: string;
    userId: string | null;
    total: number;
    couponCode: string | null;
    paymentMethod: PaymentMethod;
    to: OrderStatus;
  },
) {
  if (!input.userId) return;

  const shouldReward =
    (input.paymentMethod === "PREPAID" && input.to === "PAID") ||
    (input.paymentMethod === "COD" && input.to === "DELIVERED");

  if (shouldReward) {
    await rewardOrder(tx, {
      orderId: input.orderId,
      userId: input.userId,
      total: input.total,
    });
    return;
  }

  if (input.to === "REFUNDED") {
    await reverseOrderRewards(tx, {
      orderId: input.orderId,
      userId: input.userId,
    });
  }

  if (
    input.to === "CANCELLED" ||
    input.to === "FAILED" ||
    input.to === "REFUNDED"
  ) {
    await restoreRedemption(tx, {
      orderId: input.orderId,
      userId: input.userId,
      couponCode: input.couponCode,
    });
  }
}

export async function getAdminLoyalty() {
  const [config, totals, entryCount, referralGroups, topUsers, recentEntries] =
    await Promise.all([
      prisma.loyaltyConfig.upsert({
        where: { id: "main" },
        update: {},
        create: { id: "main" },
      }),
      prisma.user.aggregate({
        where: { accountStatus: "ACTIVE" },
        _sum: {
          pointsBalance: true,
          lifetimePointsEarned: true,
          lifetimePointsRedeemed: true,
        },
      }),
      prisma.loyaltyEntry.count({
        where: { user: { accountStatus: "ACTIVE" } },
      }),
      prisma.referral.groupBy({
        by: ["status"],
        where: {
          referrer: { accountStatus: "ACTIVE" },
          referredUser: { accountStatus: "ACTIVE" },
        },
        _count: { _all: true },
      }),
      prisma.user.findMany({
        where: { role: "CUSTOMER", accountStatus: "ACTIVE" },
        orderBy: { pointsBalance: "desc" },
        take: 10,
        select: {
          id: true,
          email: true,
          name: true,
          pointsBalance: true,
          lifetimePointsEarned: true,
          lifetimePointsRedeemed: true,
        },
      }),
      prisma.loyaltyEntry.findMany({
        orderBy: { createdAt: "desc" },
        where: { user: { accountStatus: "ACTIVE" } },
        take: 20,
        select: {
          id: true,
          type: true,
          points: true,
          description: true,
          createdAt: true,
          user: { select: { id: true, email: true, name: true } },
        },
      }),
    ]);

  const referrals = new Map(
    referralGroups.map((row) => [row.status, row._count._all]),
  );

  return {
    config,
    summary: {
      pointsOutstanding: totals._sum.pointsBalance ?? 0,
      lifetimeEarned: totals._sum.lifetimePointsEarned ?? 0,
      lifetimeRedeemed: totals._sum.lifetimePointsRedeemed ?? 0,
      ledgerEntries: entryCount,
      referralsPending: referrals.get("PENDING") ?? 0,
      referralsRewarded: referrals.get("REWARDED") ?? 0,
      referralsCancelled: referrals.get("CANCELLED") ?? 0,
    },
    topUsers,
    recentEntries,
  };
}

export async function updateLoyaltyConfig(
  body: Partial<{
    enabled: boolean;
    earnPointsPerRupee: number;
    redeemPointsPerRupee: number;
    minRedeemPoints: number;
    maxRedeemPointsPerCoupon: number | null;
    referralBonusReferrer: number;
    referralBonusReferred: number;
    couponValidityDays: number;
  }>,
) {
  const config = await prisma.loyaltyConfig.upsert({
    where: { id: "main" },
    update: body,
    create: { id: "main", ...body },
  });
  return { config };
}

export async function adjustUserPoints(
  userId: string,
  points: number,
  reason: string,
) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { pointsBalance: true },
    });
    if (!user) {
      throw new HttpError(404, "user_not_found", "User not found");
    }
    if (points < 0 && user.pointsBalance < Math.abs(points)) {
      throw new HttpError(
        409,
        "insufficient_points",
        "Adjustment would make the balance negative",
      );
    }

    const idempotencyKey = "loyalty:admin:" + randomUUID();
    const entry = await recordLedgerEntry(tx, {
      userId,
      type: "ADMIN_ADJUSTMENT",
      points,
      description: reason,
      idempotencyKey,
      earnedDelta: points > 0 ? points : 0,
    });

    return { entry };
  });
}
