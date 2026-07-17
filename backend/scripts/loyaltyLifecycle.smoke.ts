import assert from "node:assert/strict";
import { prisma } from "../src/config/db.js";
import {
  adjustUserPoints,
  applyReferralCode,
  ensureReferralCode,
  redeemPoints,
} from "../src/modules/loyalty/loyalty.service.js";
import { transition } from "../src/modules/orders/stateMachine.js";
import {
  calculateCouponDiscount,
  consumeCouponUsage,
} from "../src/modules/checkout/coupon.service.js";

const suffix = Date.now().toString(36);
const orderIds: string[] = [];
let couponCode: string | null = null;
let referrerId: string | null = null;
let referredId: string | null = null;
let outsiderId: string | null = null;

const originalConfig = await prisma.loyaltyConfig.upsert({
  where: { id: "main" },
  update: {},
  create: { id: "main" },
});

try {
  await prisma.loyaltyConfig.update({
    where: { id: "main" },
    data: {
      enabled: true,
      earnPointsPerRupee: 1,
      redeemPointsPerRupee: 10,
      minRedeemPoints: 100,
      maxRedeemPointsPerCoupon: null,
      referralBonusReferrer: 250,
      referralBonusReferred: 100,
      couponValidityDays: 30,
    },
  });

  const [referrer, referred, outsider] = await Promise.all([
    prisma.user.create({
      data: {
        firebaseUid: "loyalty-smoke-referrer-" + suffix,
        email: "loyalty-referrer-" + suffix + "@example.test",
        name: "Smoke Referrer",
      },
    }),
    prisma.user.create({
      data: {
        firebaseUid: "loyalty-smoke-referred-" + suffix,
        email: "loyalty-referred-" + suffix + "@example.test",
        name: "Smoke Referred",
      },
    }),
    prisma.user.create({
      data: {
        firebaseUid: "loyalty-smoke-outsider-" + suffix,
        email: "loyalty-outsider-" + suffix + "@example.test",
        name: "Smoke Outsider",
      },
    }),
  ]);
  referrerId = referrer.id;
  referredId = referred.id;
  outsiderId = outsider.id;

  const referralCode = await ensureReferralCode(referrer.id);
  await applyReferralCode(referred.id, referralCode);

  const qualifyingOrder = await prisma.order.create({
    data: {
      userId: referred.id,
      contactEmail: referred.email,
      subtotal: 12345,
      total: 12345,
      addressSnapshot: { city: "Test", country: "IN" },
    },
  });
  orderIds.push(qualifyingOrder.id);

  await transition(prisma, qualifyingOrder.id, "PAID", {
    actor: { kind: "system", note: "loyalty lifecycle smoke" },
    skipSideEffects: true,
  });
  await transition(prisma, qualifyingOrder.id, "PAID", {
    actor: { kind: "system", note: "idempotency replay" },
    skipSideEffects: true,
  });

  const [earnedReferrer, earnedReferred, rewardedReferral, paidLedgerCount] =
    await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: referrer.id } }),
      prisma.user.findUniqueOrThrow({ where: { id: referred.id } }),
      prisma.referral.findUniqueOrThrow({
        where: { referredUserId: referred.id },
      }),
      prisma.loyaltyEntry.count({
        where: { orderId: qualifyingOrder.id },
      }),
    ]);

  assert.equal(earnedReferrer.pointsBalance, 250);
  assert.equal(earnedReferred.pointsBalance, 223);
  assert.equal(rewardedReferral.status, "REWARDED");
  assert.equal(paidLedgerCount, 3, "PAID replay must not duplicate entries");

  await transition(prisma, qualifyingOrder.id, "REFUNDED", {
    actor: { kind: "system", note: "loyalty lifecycle refund" },
    skipSideEffects: true,
  });

  const [refundedReferrer, refundedReferred, cancelledReferral] =
    await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: referrer.id } }),
      prisma.user.findUniqueOrThrow({ where: { id: referred.id } }),
      prisma.referral.findUniqueOrThrow({
        where: { referredUserId: referred.id },
      }),
    ]);
  assert.equal(refundedReferrer.pointsBalance, 0);
  assert.equal(refundedReferred.pointsBalance, 0);
  assert.equal(cancelledReferral.status, "CANCELLED");

  await adjustUserPoints(referred.id, 500, "Lifecycle smoke seed balance");
  const redemption = await redeemPoints(referred.id, 200);
  couponCode = redemption.coupon.code;
  assert.equal(redemption.coupon.discount, 2000);

  await assert.rejects(
    () => calculateCouponDiscount(couponCode!, 5000, outsider.id),
    (error: unknown) =>
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "coupon_not_assigned",
  );

  const calculated = await calculateCouponDiscount(
    couponCode,
    5000,
    referred.id,
  );
  assert.equal(calculated.discount, 2000);

  await prisma.$transaction((tx) => consumeCouponUsage(tx, calculated));
  await assert.rejects(() =>
    prisma.$transaction((tx) => consumeCouponUsage(tx, calculated)),
  );

  const cancelledOrder = await prisma.order.create({
    data: {
      userId: referred.id,
      contactEmail: referred.email,
      subtotal: 5000,
      discount: 2000,
      couponCode,
      total: 3000,
      addressSnapshot: { city: "Test", country: "IN" },
    },
  });
  orderIds.push(cancelledOrder.id);

  await transition(prisma, cancelledOrder.id, "CANCELLED", {
    actor: { kind: "customer", userId: referred.id, note: "smoke cancel" },
    skipSideEffects: true,
  });
  await transition(prisma, cancelledOrder.id, "CANCELLED", {
    actor: { kind: "customer", userId: referred.id, note: "replay" },
    skipSideEffects: true,
  });

  const [restoredUser, restoreEntries, consumedCoupon] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: referred.id } }),
    prisma.loyaltyEntry.count({
      where: {
        userId: referred.id,
        type: "REDEMPTION_RESTORE",
        orderId: cancelledOrder.id,
      },
    }),
    prisma.coupon.findUniqueOrThrow({ where: { code: couponCode } }),
  ]);
  assert.equal(restoredUser.pointsBalance, 500);
  assert.equal(restoredUser.lifetimePointsRedeemed, 0);
  assert.equal(restoreEntries, 1, "cancellation replay must restore once");
  assert.equal(consumedCoupon.usedCount, 1);

  console.log(
    JSON.stringify({
      ok: true,
      paidReplayLedgerEntries: paidLedgerCount,
      referralRewardedThenReversed: true,
      rewardCouponAssignedAndSingleUse: true,
      restoredBalance: restoredUser.pointsBalance,
      restorationEntries: restoreEntries,
    }),
  );
} finally {
  if (orderIds.length) {
    await prisma.emailOutbox.deleteMany({
      where: { referenceType: "Order", referenceId: { in: orderIds } },
    });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  }
  if (couponCode) {
    await prisma.coupon.deleteMany({ where: { code: couponCode } });
  }
  if (referredId || referrerId || outsiderId) {
    await prisma.user.deleteMany({
      where: {
        id: { in: [referredId, referrerId, outsiderId].filter(Boolean) as string[] },
      },
    });
  }
  await prisma.loyaltyConfig.update({
    where: { id: "main" },
    data: {
      enabled: originalConfig.enabled,
      earnPointsPerRupee: originalConfig.earnPointsPerRupee,
      redeemPointsPerRupee: originalConfig.redeemPointsPerRupee,
      minRedeemPoints: originalConfig.minRedeemPoints,
      maxRedeemPointsPerCoupon: originalConfig.maxRedeemPointsPerCoupon,
      referralBonusReferrer: originalConfig.referralBonusReferrer,
      referralBonusReferred: originalConfig.referralBonusReferred,
      couponValidityDays: originalConfig.couponValidityDays,
    },
  });
  await prisma.$disconnect();
}
