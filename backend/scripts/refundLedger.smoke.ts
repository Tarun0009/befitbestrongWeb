import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { OrderStatus } from "@prisma/client";
import { prisma } from "../src/config/db.js";
import { processPaymentEvent } from "../src/jobs/paymentEvents.js";
import type { RazorpayRefund } from "../src/lib/razorpay.js";
import type { RefundProviderAdapter } from "../src/modules/refunds/refund.service.js";
import {
  getRefundSummary,
  reconcileRefundIntent,
  requestRefund,
} from "../src/modules/refunds/refund.service.js";

const runId = randomUUID().replaceAll("-", "");
const createdOrderIds: string[] = [];
const createdWebhookIds: string[] = [];

async function createCapturedOrder(label: string, status: OrderStatus) {
  const providerOrderId = `order_refund_smoke_${label}_${runId}`;
  const providerPaymentId = `pay_refund_smoke_${label}_${runId}`;
  const order = await prisma.order.create({
    data: {
      contactEmail: `refund-smoke-${label}@example.test`,
      status,
      paymentMethod: "PREPAID",
      subtotal: 10_000,
      total: 10_000,
      currency: "INR",
      addressSnapshot: { label: "refund-ledger-smoke" },
      providerOrderId,
      payment: {
        create: {
          provider: "razorpay",
          providerOrderId,
          providerPaymentId,
          amount: 10_000,
          currency: "INR",
          status: "CAPTURED",
        },
      },
    },
    include: { payment: true },
  });
  createdOrderIds.push(order.id);
  return { order, providerPaymentId };
}

function refundResult(
  id: string,
  paymentId: string,
  amount: number,
  status: RazorpayRefund["status"] = "processed",
): RazorpayRefund {
  return {
    id,
    payment_id: paymentId,
    amount,
    currency: "INR",
    status,
  };
}

try {
  const delivered = await createCapturedOrder("partial", "DELIVERED");
  let partialProviderCalls = 0;
  const partialProvider: RefundProviderAdapter = {
    refundPayment: async (input) => {
      partialProviderCalls += 1;
      return refundResult(
        `rfnd_partial_${runId}`,
        input.paymentId,
        input.amount,
      );
    },
    fetchRefund: async (input) =>
      refundResult(input.refundId, input.paymentId, input.amount),
  };

  const firstKey = `refund-smoke-partial-${runId}`;
  await requestRefund(
    {
      orderId: delivered.order.id,
      requestedById: "refund-smoke-admin",
      idempotencyKey: firstKey,
      amount: 4_000,
      reason: "Partial refund smoke test",
    },
    partialProvider,
  );
  await requestRefund(
    {
      orderId: delivered.order.id,
      requestedById: "refund-smoke-admin",
      idempotencyKey: firstKey,
      amount: 4_000,
      reason: "Partial refund smoke test",
    },
    partialProvider,
  );
  assert.equal(partialProviderCalls, 1, "idempotent replay called provider twice");
  const partialState = await prisma.order.findUniqueOrThrow({
    where: { id: delivered.order.id },
    include: { payment: true },
  });
  assert.equal(partialState.status, "DELIVERED");
  assert.equal(partialState.payment?.status, "CAPTURED");
  assert.equal((await getRefundSummary(delivered.order.id)).summary.processedAmount, 4_000);

  await assert.rejects(
    requestRefund(
      {
        orderId: delivered.order.id,
        requestedById: "refund-smoke-admin",
        idempotencyKey: `refund-smoke-overflow-${runId}`,
        amount: 6_001,
        reason: "Must exceed remaining balance",
      },
      partialProvider,
    ),
    (error: unknown) =>
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "refund_amount_exceeds_available",
  );

  let fetchCalls = 0;
  const pendingProvider: RefundProviderAdapter = {
    refundPayment: async (input) =>
      refundResult(
        `rfnd_remaining_${runId}`,
        input.paymentId,
        input.amount,
        "pending",
      ),
    fetchRefund: async (input) => {
      fetchCalls += 1;
      return refundResult(input.refundId, input.paymentId, input.amount, "processed");
    },
  };
  const pending = await requestRefund(
    {
      orderId: delivered.order.id,
      requestedById: "refund-smoke-admin",
      idempotencyKey: `refund-smoke-remaining-${runId}`,
      amount: 6_000,
      reason: "Refund the delivered balance",
    },
    pendingProvider,
  );
  const pendingIntent = pending.intents.find((intent) => intent.amount === 6_000);
  assert.equal(pendingIntent?.status, "PENDING");
  await reconcileRefundIntent(pendingIntent!.id, pendingProvider);
  const fullyRefunded = await prisma.order.findUniqueOrThrow({
    where: { id: delivered.order.id },
    include: { payment: true, history: true },
  });
  assert.equal(fetchCalls, 1);
  assert.equal(fullyRefunded.status, "REFUNDED");
  assert.equal(fullyRefunded.payment?.status, "REFUNDED");
  assert.equal(
    (await getRefundSummary(delivered.order.id)).summary.processedAmount,
    10_000,
  );
  assert.equal(
    fullyRefunded.history.filter((entry) => entry.toStatus === "REFUNDED").length,
    1,
  );

  const concurrent = await createCapturedOrder("concurrent", "DELIVERED");
  let concurrentProviderCalls = 0;
  const concurrentProvider: RefundProviderAdapter = {
    refundPayment: async (input) => {
      concurrentProviderCalls += 1;
      return refundResult(
        `rfnd_concurrent_${concurrentProviderCalls}_${runId}`,
        input.paymentId,
        input.amount,
      );
    },
    fetchRefund: async (input) =>
      refundResult(input.refundId, input.paymentId, input.amount),
  };
  const concurrentResults = await Promise.allSettled([
    requestRefund(
      {
        orderId: concurrent.order.id,
        requestedById: "refund-smoke-admin-a",
        idempotencyKey: `refund-smoke-concurrent-a-${runId}`,
        amount: 6_000,
        reason: "Concurrent refund A",
      },
      concurrentProvider,
    ),
    requestRefund(
      {
        orderId: concurrent.order.id,
        requestedById: "refund-smoke-admin-b",
        idempotencyKey: `refund-smoke-concurrent-b-${runId}`,
        amount: 6_000,
        reason: "Concurrent refund B",
      },
      concurrentProvider,
    ),
  ]);
  assert.equal(
    concurrentResults.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(
    concurrentResults.filter((result) => result.status === "rejected").length,
    1,
  );
  assert.equal(concurrentProviderCalls, 1);
  assert.equal(
    (await getRefundSummary(concurrent.order.id)).summary.processedAmount,
    6_000,
  );

  const ambiguous = await createCapturedOrder("ambiguous", "PAID");
  const providerKeys: string[] = [];
  const ambiguousProvider: RefundProviderAdapter = {
    refundPayment: async (input) => {
      providerKeys.push(input.idempotencyKey);
      throw new Error("simulated lost provider response");
    },
    fetchRefund: async () => {
      throw new Error("provider refund id is not known yet");
    },
  };
  const ambiguousKey = `refund-smoke-ambiguous-${runId}`;
  const ambiguousResult = await requestRefund(
    {
      orderId: ambiguous.order.id,
      requestedById: "refund-smoke-admin",
      idempotencyKey: ambiguousKey,
      amount: 10_000,
      reason: "Simulate an ambiguous provider result",
    },
    ambiguousProvider,
  );
  assert.equal(ambiguousResult.intents[0]?.status, "RECONCILIATION_REQUIRED");

  const recoveryProvider: RefundProviderAdapter = {
    refundPayment: async (input) => {
      providerKeys.push(input.idempotencyKey);
      return refundResult(
        `rfnd_ambiguous_${runId}`,
        input.paymentId,
        input.amount,
      );
    },
    fetchRefund: async (input) =>
      refundResult(input.refundId, input.paymentId, input.amount),
  };
  await requestRefund(
    {
      orderId: ambiguous.order.id,
      requestedById: "refund-smoke-admin",
      idempotencyKey: ambiguousKey,
      amount: 10_000,
      reason: "Simulate an ambiguous provider result",
    },
    recoveryProvider,
  );
  assert.equal(providerKeys.length, 2);
  assert.equal(providerKeys[0], providerKeys[1], "provider key changed on recovery");
  assert.equal(
    (await prisma.order.findUniqueOrThrow({ where: { id: ambiguous.order.id } })).status,
    "REFUNDED",
  );

  const webhookOrder = await createCapturedOrder("webhook", "DELIVERED");
  const webhookRefundId = `rfnd_webhook_${runId}`;
  const webhookProvider: RefundProviderAdapter = {
    refundPayment: async (input) =>
      refundResult(webhookRefundId, input.paymentId, input.amount, "pending"),
    fetchRefund: async (input) =>
      refundResult(input.refundId, input.paymentId, input.amount, "pending"),
  };
  const webhookPending = await requestRefund(
    {
      orderId: webhookOrder.order.id,
      requestedById: "refund-smoke-admin",
      idempotencyKey: `refund-smoke-webhook-${runId}`,
      amount: 10_000,
      reason: "Complete through signed webhook processing",
    },
    webhookProvider,
  );
  const webhookIntent = webhookPending.intents[0]!;
  const webhook = await prisma.webhookEvent.create({
    data: {
      provider: "razorpay",
      eventId: `refund.processed:${webhookRefundId}`,
      eventType: "refund.processed",
      signature: "integration-smoke-signature",
      payload: {
        event: "refund.processed",
        payload: {
          refund: {
            entity: {
              entity: "refund",
              id: webhookRefundId,
              payment_id: webhookOrder.providerPaymentId,
              amount: 10_000,
              currency: "INR",
              status: "processed",
              notes: { refundIntentId: webhookIntent.id },
            },
          },
        },
      },
    },
  });
  createdWebhookIds.push(webhook.id);
  const webhookResult = await processPaymentEvent(webhook.id);
  const webhookReplay = await processPaymentEvent(webhook.id);
  assert.equal(webhookResult.outcome, "PROCESSED");
  assert.equal(webhookResult.code, "refund_state_applied");
  assert.equal(webhookReplay.alreadyProcessed, true);
  assert.equal(
    (await prisma.order.findUniqueOrThrow({ where: { id: webhookOrder.order.id } })).status,
    "REFUNDED",
  );

  console.log(
    JSON.stringify({
      status: "passed",
      partialRefundPreservedOrder: true,
      replayIdempotent: true,
      overRefundRejected: true,
      pendingRefundReconciled: true,
      concurrentOverRefundPrevented: true,
      ambiguousResponseRecoveredWithStableKey: true,
      refundWebhookFinalizedAndReplayedSafely: true,
    }),
  );
} finally {
  if (createdWebhookIds.length > 0) {
    await prisma.webhookEvent.deleteMany({
      where: { id: { in: createdWebhookIds } },
    });
  }
  if (createdOrderIds.length > 0) {
    await prisma.emailOutbox.deleteMany({
      where: { referenceType: "Order", referenceId: { in: createdOrderIds } },
    });
    await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
  }
  await prisma.$disconnect();
}
