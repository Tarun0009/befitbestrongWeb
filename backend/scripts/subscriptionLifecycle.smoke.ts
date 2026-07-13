import assert from "node:assert/strict";
import { prisma } from "../src/config/db.js";
import {
  controlSubscription,
  createSubscriptionPlan,
  enrollSubscription,
  processDueSubscriptions,
} from "../src/modules/subscriptions/subscription.service.js";

const suffix = Date.now().toString(36);
let userId: string | null = null;
let categoryId: string | null = null;
let productId: string | null = null;
let planId: string | null = null;
let orderId: string | null = null;

try {
  const user = await prisma.user.create({
    data: {
      firebaseUid: "subscription-smoke-" + suffix,
      email: "subscription-smoke-" + suffix + "@example.test",
      name: "Subscription Smoke",
    },
  });
  userId = user.id;
  const category = await prisma.category.create({
    data: { name: "Subscription Smoke " + suffix, slug: "subscription-smoke-" + suffix },
  });
  categoryId = category.id;
  const product = await prisma.product.create({
    data: {
      name: "Subscription Product " + suffix,
      slug: "subscription-product-" + suffix,
      description: "Temporary subscription lifecycle fixture",
      categoryId: category.id,
      basePrice: 5000,
      variants: { create: { sku: "SUB-SMOKE-" + suffix, price: 5000, stock: 5 } },
    },
    include: { variants: true },
  });
  productId = product.id;
  const variant = product.variants[0]!;

  const planResult = await createSubscriptionPlan({
    name: "Monthly Refill " + suffix,
    variantId: variant.id,
    discountPercent: 10,
    allowedFrequencies: [30, 60],
    active: true,
  });
  planId = planResult.plan.id;

  const order = await prisma.order.create({
    data: {
      userId: user.id,
      contactEmail: user.email,
      status: "PAID",
      subtotal: 5000,
      total: 5000,
      addressSnapshot: {
        fullName: "Subscription Smoke",
        phone: "9999999999",
        line1: "Test address",
        city: "Delhi",
        state: "Delhi",
        pincode: "110001",
        country: "IN",
      },
      items: {
        create: {
          variantId: variant.id,
          unitPrice: 5000,
          quantity: 1,
          subtotal: 5000,
          productSnapshot: { name: product.name, slug: product.slug, sku: variant.sku },
        },
      },
    },
  });
  orderId = order.id;

  const enrolled = await enrollSubscription(user.id, {
    planId,
    orderId,
    quantity: 2,
    frequencyDays: 30,
  });
  const subscriptionId = enrolled.subscription.id;
  assert.equal(enrolled.subscription.discountPercent, 10);
  assert.equal(enrolled.subscription.quantity, 2);
  assert.equal(enrolled.subscription.status, "ACTIVE");

  const paused = await controlSubscription(user.id, subscriptionId, "pause");
  assert.equal(paused.status, "PAUSED");
  const resumed = await controlSubscription(user.id, subscriptionId, "resume");
  assert.equal(resumed.status, "ACTIVE");
  const skipped = await controlSubscription(user.id, subscriptionId, "skip");
  assert.equal(skipped.renewals[0]?.status, "SKIPPED");

  const readySchedule = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await prisma.userSubscription.update({
    where: { id: subscriptionId },
    data: { nextOrderAt: readySchedule },
  });
  const readyRun = await processDueSubscriptions(new Date());
  assert.equal(readyRun.processed, 1);
  assert.equal(readyRun.results[0]?.status, "READY");
  const replay = await processDueSubscriptions(new Date());
  assert.equal(replay.processed, 0);

  await prisma.productVariant.update({ where: { id: variant.id }, data: { stock: 0 } });
  const blockedSchedule = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  await prisma.userSubscription.update({
    where: { id: subscriptionId },
    data: { nextOrderAt: blockedSchedule },
  });
  const blockedRun = await processDueSubscriptions(new Date());
  assert.equal(blockedRun.processed, 1);
  assert.equal(blockedRun.results[0]?.status, "STOCK_BLOCKED");

  const cancelled = await controlSubscription(user.id, subscriptionId, "cancel");
  assert.equal(cancelled.status, "CANCELLED");
  await prisma.userSubscription.update({ where: { id: subscriptionId }, data: { nextOrderAt: new Date(0) } });
  const afterCancel = await processDueSubscriptions(new Date());
  assert.equal(afterCancel.processed, 0);

  const renewals = await prisma.subscriptionRenewal.findMany({
    where: { subscriptionId },
    orderBy: { scheduledFor: "asc" },
  });
  assert.deepEqual(
    renewals.map((renewal) => renewal.status).sort(),
    ["READY", "SKIPPED", "STOCK_BLOCKED"].sort(),
  );
  const ready = renewals.find((renewal) => renewal.status === "READY");
  assert.equal(ready?.unitPriceSnapshot, 5000);
  assert.equal(ready?.discountedUnitPrice, 4500);

  console.log(JSON.stringify({
    ok: true,
    snapshottedDiscountPercent: enrolled.subscription.discountPercent,
    readyRenewalPrice: ready?.discountedUnitPrice,
    renewalStatuses: renewals.map((renewal) => renewal.status),
    cancelledExcludedFromScan: true,
  }));
} finally {
  if (orderId) await prisma.order.deleteMany({ where: { id: orderId } });
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
  if (planId) await prisma.subscriptionPlan.deleteMany({ where: { id: planId } });
  if (productId) await prisma.product.deleteMany({ where: { id: productId } });
  if (categoryId) await prisma.category.deleteMany({ where: { id: categoryId } });
  await prisma.$disconnect();
}