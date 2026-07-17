import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { prisma } from "../src/config/db.js";
import { redis } from "../src/config/redis.js";
import { addItem, clearCart } from "../src/modules/cart/cart.service.js";
import { createCheckoutSession } from "../src/modules/checkout/checkout.service.js";
import { processExpiredCheckoutReservations } from "../src/modules/checkout/checkoutExpiry.service.js";
import { checkoutOwnerHash } from "../src/modules/checkout/checkoutIdempotency.policy.js";

const runId = randomUUID().replaceAll("-", "");
const shortId = runId.slice(0, 20);
const guestOwner = { type: "guest" as const, id: `expiry-guest-${runId}` };
let userOwner: { type: "user"; id: string } | null = null;
const createdIds = {
  category: null as string | null,
  product: null as string | null,
  area: null as string | null,
  user: null as string | null,
  coupons: [] as string[],
  orders: [] as string[],
};

try {
  const category = await prisma.category.create({
    data: { name: `Expiry ${runId}`, slug: `expiry-${runId}` },
  });
  createdIds.category = category.id;
  const product = await prisma.product.create({
    data: {
      name: "Reservation expiry smoke product",
      slug: `expiry-product-${runId}`,
      description: "Temporary reservation expiry verification product",
      categoryId: category.id,
      basePrice: 10_000,
      variants: {
        create: { sku: `EXPIRY-${runId}`, price: 10_000, stock: 10 },
      },
    },
    include: { variants: true },
  });
  createdIds.product = product.id;
  const variantId = product.variants[0]!.id;
  const pincode = `8${Date.now().toString().slice(-5)}`;
  const area = await prisma.serviceArea.create({
    data: {
      pincode,
      zone: "DELHI",
      city: "Expiry Integration",
      state: "Delhi",
      prepaidEnabled: true,
      codEnabled: true,
    },
  });
  createdIds.area = area.id;

  const user = await prisma.user.create({
    data: {
      firebaseUid: `expiry-${runId}`,
      email: `expiry-${runId}@example.com`,
      pointsBalance: 0,
      lifetimePointsRedeemed: 100,
    },
  });
  createdIds.user = user.id;
  userOwner = { type: "user", id: user.id };

  const genericCoupon = await prisma.coupon.create({
    data: {
      code: `EXP-${shortId}`.toUpperCase(),
      type: "FIXED_AMOUNT",
      value: 1_000,
      minSubtotal: 1_000,
      maxUses: 10,
    },
  });
  const loyaltyCoupon = await prisma.coupon.create({
    data: {
      code: `LOY-${shortId}`.toUpperCase(),
      type: "FIXED_AMOUNT",
      value: 1_000,
      minSubtotal: 1_000,
      maxUses: 1,
      assignedUserId: user.id,
      source: "LOYALTY",
    },
  });
  createdIds.coupons.push(genericCoupon.id, loyaltyCoupon.id);
  await prisma.loyaltyEntry.create({
    data: {
      userId: user.id,
      type: "COUPON_REDEMPTION",
      points: -100,
      couponCode: loyaltyCoupon.code,
      description: "Expiry smoke redemption",
      idempotencyKey: `expiry:redeem:${runId}`,
    },
  });

  await Promise.all([
    addItem(guestOwner, variantId, 1),
    addItem(userOwner, variantId, 1),
  ]);
  const address = {
    fullName: "Expiry Buyer",
    phone: "9876543210",
    line1: "1 Expiry Street",
    city: "Expiry Integration",
    state: "Delhi",
    pincode,
    country: "IN",
  };
  const [guestCheckout, userCheckout] = await Promise.all([
    createCheckoutSession({
      userId: null,
      contactEmail: "expiry-guest@example.com",
      couponCode: genericCoupon.code,
      cartOwner: guestOwner,
      address,
      paymentMethod: "PREPAID",
      idempotencyKey: randomBytes(32).toString("hex"),
    }),
    createCheckoutSession({
      userId: user.id,
      contactEmail: user.email,
      couponCode: loyaltyCoupon.code,
      cartOwner: userOwner,
      address,
      paymentMethod: "PREPAID",
      idempotencyKey: randomBytes(32).toString("hex"),
    }),
  ]);
  createdIds.orders.push(
    guestCheckout.result.orderId,
    userCheckout.result.orderId,
  );

  const now = new Date();
  await prisma.order.updateMany({
    where: { id: { in: createdIds.orders } },
    data: { reservationExpiresAt: new Date(now.getTime() - 1_000) },
  });
  await Promise.all([
    processExpiredCheckoutReservations({ now, batchSize: 10 }),
    processExpiredCheckoutReservations({ now, batchSize: 10 }),
  ]);

  const orders = await prisma.order.findMany({
    where: { id: { in: createdIds.orders } },
    include: { payment: true, history: true },
  });
  assert.equal(orders.length, 2);
  for (const order of orders) {
    assert.equal(order.status, "CANCELLED");
    assert.ok(order.reservationExpiredAt);
    assert.equal(order.payment?.status, "FAILED");
    assert.equal(
      order.history.filter(
        (entry) =>
          entry.fromStatus === "PENDING" &&
          entry.toStatus === "CANCELLED" &&
          entry.note === "checkout reservation expired",
      ).length,
      1,
    );
  }

  const variant = await prisma.productVariant.findUniqueOrThrow({
    where: { id: variantId },
  });
  assert.equal(variant.stock, 10, "stock must be restored exactly once");
  const [genericAfter, loyaltyAfter, userAfter, restoreCount] = await Promise.all([
    prisma.coupon.findUniqueOrThrow({ where: { id: genericCoupon.id } }),
    prisma.coupon.findUniqueOrThrow({ where: { id: loyaltyCoupon.id } }),
    prisma.user.findUniqueOrThrow({ where: { id: user.id } }),
    prisma.loyaltyEntry.count({
      where: {
        userId: user.id,
        type: "REDEMPTION_RESTORE",
        couponCode: loyaltyCoupon.code,
      },
    }),
  ]);
  assert.equal(genericAfter.usedCount, 0, "promotion usage must be restored");
  assert.equal(loyaltyAfter.usedCount, 1, "loyalty coupon must remain consumed");
  assert.equal(userAfter.pointsBalance, 100, "loyalty points must be restored");
  assert.equal(userAfter.lifetimePointsRedeemed, 0);
  assert.equal(restoreCount, 1, "loyalty ledger restore must be idempotent");

  const replayScan = await processExpiredCheckoutReservations({ now, batchSize: 10 });
  assert.equal(replayScan.candidates, 0);
  assert.equal(
    (await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock,
    10,
  );

  console.log(
    JSON.stringify({
      status: "passed",
      expiredOrders: orders.length,
      stockRestored: 2,
      promotionUsageRestored: true,
      loyaltyPointsRestored: 100,
      replayCandidates: replayScan.candidates,
    }),
  );
} finally {
  await Promise.allSettled([
    clearCart(guestOwner),
    ...(userOwner ? [clearCart(userOwner)] : []),
  ]);
  if (createdIds.orders.length > 0) {
    await prisma.emailOutbox.deleteMany({
      where: { referenceType: "Order", referenceId: { in: createdIds.orders } },
    });
    await prisma.order.deleteMany({ where: { id: { in: createdIds.orders } } });
  }
  await prisma.checkoutAttempt.deleteMany({
    where: {
      ownerHash: {
        in: [
          checkoutOwnerHash(guestOwner),
          ...(userOwner ? [checkoutOwnerHash(userOwner)] : []),
        ],
      },
    },
  });
  if (createdIds.user) {
    await prisma.loyaltyEntry.deleteMany({ where: { userId: createdIds.user } });
  }
  if (createdIds.coupons.length > 0) {
    await prisma.coupon.deleteMany({ where: { id: { in: createdIds.coupons } } });
  }
  if (createdIds.user) await prisma.user.deleteMany({ where: { id: createdIds.user } });
  if (createdIds.product) {
    await prisma.product.deleteMany({ where: { id: createdIds.product } });
  }
  if (createdIds.category) {
    await prisma.category.deleteMany({ where: { id: createdIds.category } });
  }
  if (createdIds.area) {
    await prisma.serviceArea.deleteMany({ where: { id: createdIds.area } });
  }
  await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
}
