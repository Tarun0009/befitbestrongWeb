import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { prisma } from "../src/config/db.js";
import { redis } from "../src/config/redis.js";
import { addItem, clearCart } from "../src/modules/cart/cart.service.js";
import { createCheckoutSession } from "../src/modules/checkout/checkout.service.js";
import {
  checkoutKeyHash,
  checkoutOwnerHash,
} from "../src/modules/checkout/checkoutIdempotency.policy.js";
import { HttpError } from "../src/middleware/errorHandler.js";

const runId = randomUUID().replaceAll("-", "");
const owner = { type: "guest" as const, id: `idempotency-${runId}` };
const idempotencyKey = randomBytes(32).toString("hex");
const pincode = `9${Date.now().toString().slice(-5)}`;
let categoryId: string | null = null;
let productId: string | null = null;
let orderId: string | null = null;
let serviceAreaId: string | null = null;

try {
  const category = await prisma.category.create({
    data: { name: `Idempotency ${runId}`, slug: `idempotency-${runId}` },
  });
  categoryId = category.id;
  const product = await prisma.product.create({
    data: {
      name: "Idempotency smoke product",
      slug: `idempotency-product-${runId}`,
      description: "Temporary checkout idempotency verification product",
      categoryId: category.id,
      basePrice: 10_000,
      variants: {
        create: { sku: `IDEMP-${runId}`, price: 10_000, stock: 5 },
      },
    },
    include: { variants: true },
  });
  productId = product.id;
  const area = await prisma.serviceArea.create({
    data: {
      pincode,
      zone: "DELHI",
      city: "Integration Test",
      state: "Delhi",
      prepaidEnabled: true,
      codEnabled: true,
    },
  });
  serviceAreaId = area.id;
  await addItem(owner, product.variants[0]!.id, 1);

  const input = {
    userId: null,
    contactEmail: "idempotency@example.com",
    cartOwner: owner,
    address: {
      fullName: "Idempotency Buyer",
      phone: "9876543210",
      line1: "1 Integration Street",
      city: "Integration Test",
      state: "Delhi",
      pincode,
      country: "IN",
    },
    paymentMethod: "PREPAID" as const,
    idempotencyKey,
  };

  const concurrent = await Promise.allSettled([
    createCheckoutSession(input),
    createCheckoutSession(input),
  ]);
  const fulfilled = concurrent.filter(
    (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof createCheckoutSession>>> =>
      result.status === "fulfilled",
  );
  assert.ok(fulfilled.length >= 1, "at least one concurrent request must succeed");
  orderId = fulfilled[0]!.value.result.orderId;

  const replay = await createCheckoutSession(input);
  assert.equal(replay.replayed, true);
  assert.equal(replay.result.orderId, orderId);
  assert.equal(replay.result.guestAccessToken, idempotencyKey);

  const attempt = await prisma.checkoutAttempt.findUniqueOrThrow({
    where: {
      ownerHash_keyHash: {
        ownerHash: checkoutOwnerHash(owner),
        keyHash: checkoutKeyHash(idempotencyKey),
      },
    },
  });
  assert.equal(attempt.status, "COMPLETED");
  assert.equal(attempt.orderId, orderId);
  assert.equal(await prisma.order.count({ where: { id: orderId } }), 1);
  assert.equal(
    await prisma.orderItem.count({ where: { orderId } }),
    1,
  );
  const variant = await prisma.productVariant.findUniqueOrThrow({
    where: { id: product.variants[0]!.id },
  });
  assert.equal(variant.stock, 4, "stock must be reserved exactly once");

  await assert.rejects(
    createCheckoutSession({
      ...input,
      address: { ...input.address, line1: "Different address" },
    }),
    (error: unknown) =>
      error instanceof HttpError && error.code === "idempotency_key_reused",
  );

  console.log(
    JSON.stringify({
      status: "passed",
      orderId,
      concurrentRequests: concurrent.length,
      fulfilledRequests: fulfilled.length,
      stockReserved: 1,
      replayed: replay.replayed,
    }),
  );
} finally {
  await clearCart(owner).catch(() => undefined);
  const attemptOrders = await prisma.checkoutAttempt.findMany({
    where: {
      ownerHash: checkoutOwnerHash(owner),
      keyHash: checkoutKeyHash(idempotencyKey),
    },
    select: { orderId: true },
  });
  const cleanupOrderIds = [
    ...new Set(
      [orderId, ...attemptOrders.map((attempt) => attempt.orderId)].filter(
        (id): id is string => Boolean(id),
      ),
    ),
  ];
  if (cleanupOrderIds.length > 0) {
    await prisma.emailOutbox.deleteMany({
      where: { referenceType: "Order", referenceId: { in: cleanupOrderIds } },
    });
    await prisma.order.deleteMany({ where: { id: { in: cleanupOrderIds } } });
  }
  await prisma.checkoutAttempt.deleteMany({
    where: {
      ownerHash: checkoutOwnerHash(owner),
      keyHash: checkoutKeyHash(idempotencyKey),
    },
  });
  if (productId) await prisma.product.deleteMany({ where: { id: productId } });
  if (categoryId) await prisma.category.deleteMany({ where: { id: categoryId } });
  if (serviceAreaId) {
    await prisma.serviceArea.deleteMany({ where: { id: serviceAreaId } });
  }
  await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
}
