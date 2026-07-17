import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/config/db.js";
import {
  enqueueEmail,
  processEmailOutbox,
  retryEmailOutbox,
} from "../src/modules/notifications/emailOutbox.service.js";
import {
  EmailProviderError,
  type EmailProviderAdapter,
  type EmailProviderSendInput,
} from "../src/modules/notifications/resend.provider.js";
import { queueBackInStockNotifications } from "../src/modules/wishlist/stockAlertEmail.service.js";
import { transition } from "../src/modules/orders/stateMachine.js";

const runId = randomUUID().replaceAll("-", "");
const prefix = `email-smoke/${runId}`;
const created = {
  order: null as string | null,
  alert: null as string | null,
  user: null as string | null,
  product: null as string | null,
  category: null as string | null,
};
const sentKeys: string[] = [];
const successProvider: EmailProviderAdapter = {
  async send(input: EmailProviderSendInput) {
    sentKeys.push(input.idempotencyKey);
    return { id: `provider-${sentKeys.length}` };
  },
};

function input(label: string) {
  return {
    idempotencyKey: `${prefix}/${label}`,
    template: "ORDER_STATUS" as const,
    recipientEmail: "email-smoke@example.test",
    fromEmail: "orders@example.test",
    subject: `Smoke ${label}`,
    html: `<p>${label}</p>`,
    referenceType: "Smoke",
    referenceId: `${runId}-${label}`,
  };
}

try {
  const replayInput = input("replay");
  const [first, replay] = await Promise.all([
    prisma.$transaction((tx) => enqueueEmail(tx, replayInput)),
    prisma.$transaction((tx) => enqueueEmail(tx, replayInput)),
  ]);
  assert.equal(first.id, replay.id, "same application key must replay one row");
  assert.equal(
    await prisma.emailOutbox.count({ where: { idempotencyKey: replayInput.idempotencyKey } }),
    1,
  );
  assert.equal(
    await prisma.emailOutboxEvent.count({ where: { emailOutboxId: first.id } }),
    1,
    "replay must not duplicate audit events",
  );

  await assert.rejects(
    prisma.$transaction((tx) =>
      enqueueEmail(tx, { ...replayInput, subject: "Changed content" }),
    ),
    (error: unknown) =>
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "email_idempotency_conflict",
  );

  const rollbackKey = `${prefix}/rolled-back`;
  await assert.rejects(
    prisma.$transaction(async (tx) => {
      await enqueueEmail(tx, { ...input("rollback"), idempotencyKey: rollbackKey });
      throw new Error("rollback business write");
    }),
  );
  assert.equal(
    await prisma.emailOutbox.count({ where: { idempotencyKey: rollbackKey } }),
    0,
    "outbox write must roll back with its business transaction",
  );

  const transient = await prisma.$transaction((tx) =>
    enqueueEmail(tx, input("transient")),
  );
  let transientCalls = 0;
  const transientProvider: EmailProviderAdapter = {
    async send() {
      transientCalls += 1;
      throw new EmailProviderError("rate_limit_exceeded", "Slow down", true, 429, 1_000);
    },
  };
  const pending = await processEmailOutbox(transient.id, transientProvider);
  assert.equal(pending.email?.status, "PENDING");
  assert.equal(pending.email?.attemptCount, 1);
  await prisma.emailOutbox.update({
    where: { id: transient.id },
    data: { nextAttemptAt: new Date(0) },
  });
  const sent = await processEmailOutbox(transient.id, successProvider);
  assert.equal(sent.email?.status, "SENT");
  const stableKey = sent.email?.providerIdempotencyKey;
  assert.ok(stableKey);
  assert.equal(sentKeys.at(-1), stableKey);
  const callsBeforeReplay = sentKeys.length;
  await processEmailOutbox(transient.id, successProvider);
  assert.equal(sentKeys.length, callsBeforeReplay, "sent replay must not call provider");
  assert.equal(transientCalls, 1);

  const permanent = await prisma.$transaction((tx) =>
    enqueueEmail(tx, input("permanent")),
  );
  const permanentProvider: EmailProviderAdapter = {
    async send() {
      throw new EmailProviderError("validation_error", "Bad recipient", false, 422);
    },
  };
  const dead = await processEmailOutbox(permanent.id, permanentProvider);
  assert.equal(dead.email?.status, "DEAD_LETTER");
  const permanentKey = dead.email?.providerIdempotencyKey;
  await retryEmailOutbox(permanent.id, "email-smoke-admin");
  const recovered = await processEmailOutbox(permanent.id, successProvider);
  assert.equal(recovered.email?.status, "SENT");
  assert.equal(recovered.email?.providerIdempotencyKey, permanentKey);
  assert.equal(sentKeys.at(-1), permanentKey);

  const leased = await prisma.$transaction((tx) =>
    enqueueEmail(tx, input("expired-lease")),
  );
  await prisma.emailOutbox.update({
    where: { id: leased.id },
    data: {
      status: "PROCESSING",
      attemptCount: 1,
      leaseExpiresAt: new Date(Date.now() - 1_000),
    },
  });
  const recoveredLease = await processEmailOutbox(leased.id, successProvider);
  assert.equal(recoveredLease.email?.status, "SENT");
  assert.equal(recoveredLease.email?.attemptCount, 2);

  const order = await prisma.order.create({
    data: {
      contactEmail: "order-email-smoke@example.test",
      status: "PENDING",
      paymentMethod: "PREPAID",
      subtotal: 1_000,
      total: 1_000,
      addressSnapshot: { fullName: "Email Smoke", city: "Noida", pincode: "201301" },
    },
  });
  created.order = order.id;
  await transition(prisma, order.id, "FAILED", {
    actor: { kind: "system", note: "email outbox smoke" },
  });
  const orderEmail = await prisma.emailOutbox.findUnique({
    where: { idempotencyKey: `order-status/${order.id}/FAILED` },
  });
  assert.ok(orderEmail, "order status and its email must commit together");

  const category = await prisma.category.create({
    data: { name: `Email Smoke ${runId}`, slug: `email-smoke-${runId}` },
  });
  created.category = category.id;
  const product = await prisma.product.create({
    data: {
      name: "Email Smoke Product",
      slug: `email-smoke-product-${runId}`,
      description: "Temporary email outbox fixture",
      categoryId: category.id,
      basePrice: 1_000,
      variants: { create: { sku: `EMAIL-${runId}`, price: 1_000, stock: 0 } },
    },
    include: { variants: true },
  });
  created.product = product.id;
  const user = await prisma.user.create({
    data: {
      firebaseUid: `email-smoke-${runId}`,
      email: `email-smoke-${runId}@example.test`,
    },
  });
  created.user = user.id;
  const alert = await prisma.stockAlert.create({
    data: { userId: user.id, variantId: product.variants[0]!.id },
  });
  created.alert = alert.id;
  await prisma.$transaction(async (tx) => {
    await tx.productVariant.update({
      where: { id: product.variants[0]!.id },
      data: { stock: 3 },
    });
    await queueBackInStockNotifications(tx, product.variants[0]!.id, 0, 3);
  });
  const stockEmail = await prisma.emailOutbox.findFirstOrThrow({
    where: { referenceType: "StockAlert", referenceId: alert.id },
  });
  await prisma.stockAlert.update({ where: { id: alert.id }, data: { active: false } });
  const providerCallsBeforeCancellation = sentKeys.length;
  const cancelled = await processEmailOutbox(stockEmail.id, successProvider);
  assert.equal(cancelled.email?.status, "CANCELLED");
  assert.equal(
    sentKeys.length,
    providerCallsBeforeCancellation,
    "unsubscribed stock alert must never reach the provider",
  );

  console.log(
    JSON.stringify({
      status: "passed",
      concurrentReplayRows: 1,
      transactionRollbackSafe: true,
      transientRetryRecovered: true,
      deadLetterRecovered: true,
      expiredLeaseRecovered: true,
      orderTransitionAtomic: true,
      stockUnsubscribeCancelled: true,
    }),
  );
} finally {
  await prisma.emailOutbox.deleteMany({
    where: {
      OR: [
        { idempotencyKey: { startsWith: prefix } },
        ...(created.order
          ? [{ referenceType: "Order", referenceId: created.order }]
          : []),
        ...(created.alert
          ? [{ referenceType: "StockAlert", referenceId: created.alert }]
          : []),
      ],
    },
  });
  if (created.order) await prisma.order.deleteMany({ where: { id: created.order } });
  if (created.user) await prisma.user.deleteMany({ where: { id: created.user } });
  if (created.product) await prisma.product.deleteMany({ where: { id: created.product } });
  if (created.category) await prisma.category.deleteMany({ where: { id: created.category } });
  await prisma.$disconnect();
}
