import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { OrderStatus } from "@prisma/client";
import { prisma } from "../src/config/db.js";
import { processPaymentEvent } from "../src/jobs/paymentEvents.js";

const runId = randomUUID().replaceAll("-", "");
const createdOrderIds: string[] = [];
const createdWebhookIds: string[] = [];

function razorpayPayload(input: {
  eventType: "payment.captured" | "payment.failed";
  providerOrderId: string;
  providerPaymentId: string;
  amount?: number;
  currency?: string;
  status?: string;
}) {
  return {
    entity: "event",
    event: input.eventType,
    payload: {
      payment: {
        entity: {
          id: input.providerPaymentId,
          entity: "payment",
          order_id: input.providerOrderId,
          amount: input.amount ?? 12_500,
          currency: input.currency ?? "INR",
          status:
            input.status ??
            (input.eventType === "payment.captured" ? "captured" : "failed"),
        },
      },
    },
  };
}

async function createOrder(label: string, status: OrderStatus = "PENDING") {
  const providerOrderId = `order_smoke_${label}_${runId}`;
  const order = await prisma.order.create({
    data: {
      contactEmail: `payment-smoke-${label}@example.com`,
      status,
      paymentMethod: "PREPAID",
      subtotal: 12_500,
      total: 12_500,
      currency: "INR",
      addressSnapshot: { label: "payment-event-smoke" },
      providerOrderId,
      reservationExpiresAt: new Date(Date.now() + 15 * 60_000),
      payment: {
        create: {
          provider: "razorpay",
          providerOrderId,
          amount: 12_500,
          currency: "INR",
          status: "CREATED",
        },
      },
    },
  });
  createdOrderIds.push(order.id);
  return order;
}

async function createWebhook(
  label: string,
  eventType: string,
  payload: object,
) {
  const event = await prisma.webhookEvent.create({
    data: {
      provider: "razorpay",
      eventId: `event_smoke_${label}_${runId}`,
      eventType,
      signature: "integration-smoke-signature",
      payload,
    },
  });
  createdWebhookIds.push(event.id);
  return event;
}

try {
  const captureOrder = await createOrder("capture");
  const capturePaymentId = `pay_smoke_capture_${runId}`;
  const captureEvent = await createWebhook(
    "capture",
    "payment.captured",
    razorpayPayload({
      eventType: "payment.captured",
      providerOrderId: captureOrder.providerOrderId!,
      providerPaymentId: capturePaymentId,
    }),
  );
  const captureResult = await processPaymentEvent(captureEvent.id);
  const captureReplay = await processPaymentEvent(captureEvent.id);
  const captured = await prisma.order.findUniqueOrThrow({
    where: { id: captureOrder.id },
    include: { payment: true, history: true },
  });
  const capturedAudit = await prisma.webhookEvent.findUniqueOrThrow({
    where: { id: captureEvent.id },
  });
  assert.equal(captureResult.outcome, "PROCESSED");
  assert.equal(captureReplay.alreadyProcessed, true);
  assert.equal(captured.status, "PAID");
  assert.equal(captured.payment?.status, "CAPTURED");
  assert.equal(captured.payment?.providerPaymentId, capturePaymentId);
  assert.equal(captured.history.length, 1, "replay must not add order history");
  assert.equal(capturedAudit.outcome, "PROCESSED");
  assert.equal(capturedAudit.processingCode, "payment_captured");

  // payment.failed → PaymentAttempt records the failure but the order stays
  // PENDING (still payable). Per razorpayEvent.policy.ts:336-352, a single
  // card decline doesn't terminally fail the order — the customer can retry.
  const failedOrder = await createOrder("failed");
  const failedProviderPaymentId = `pay_smoke_failed_${runId}`;
  const failedEvent = await createWebhook(
    "failed",
    "payment.failed",
    razorpayPayload({
      eventType: "payment.failed",
      providerOrderId: failedOrder.providerOrderId!,
      providerPaymentId: failedProviderPaymentId,
    }),
  );
  const failedResult = await processPaymentEvent(failedEvent.id);
  const failed = await prisma.order.findUniqueOrThrow({
    where: { id: failedOrder.id },
    include: { payment: true, history: true },
  });
  const failedAudit = await prisma.webhookEvent.findUniqueOrThrow({
    where: { id: failedEvent.id },
  });
  const failedAttempt = await prisma.paymentAttempt.findUnique({
    where: { providerPaymentId: failedProviderPaymentId },
  });
  assert.equal(failedResult.outcome, "PROCESSED");
  assert.equal(failedResult.code, "payment_attempt_failed");
  // Order stays payable — no state transition, no history entry.
  assert.equal(failed.status, "PENDING");
  assert.equal(failed.history.length, 0);
  // Local Payment row untouched; only AUTHORIZED events promote it. FAILED
  // attempts live on PaymentAttempt so the retry story stays clean.
  assert.equal(failed.payment?.status, "CREATED");
  // The failure IS recorded — just on PaymentAttempt, not Payment.
  assert.ok(failedAttempt, "expected a PaymentAttempt row for the failed capture");
  assert.equal(failedAttempt!.status, "FAILED");
  assert.equal(failedAttempt!.providerPaymentId, failedProviderPaymentId);
  assert.equal(failedAudit.outcome, "PROCESSED");
  assert.equal(failedAudit.processingCode, "payment_attempt_failed");

  const mismatchOrder = await createOrder("amount");
  const mismatchEvent = await createWebhook(
    "amount",
    "payment.captured",
    razorpayPayload({
      eventType: "payment.captured",
      providerOrderId: mismatchOrder.providerOrderId!,
      providerPaymentId: `pay_smoke_amount_${runId}`,
      amount: 12_501,
    }),
  );
  const mismatchResult = await processPaymentEvent(mismatchEvent.id);
  const mismatch = await prisma.order.findUniqueOrThrow({
    where: { id: mismatchOrder.id },
    include: { payment: true, history: true },
  });
  const mismatchAudit = await prisma.webhookEvent.findUniqueOrThrow({
    where: { id: mismatchEvent.id },
  });
  assert.equal(mismatchResult.outcome, "RECONCILIATION_REQUIRED");
  assert.equal(mismatchResult.code, "amount_mismatch");
  assert.equal(mismatch.status, "PENDING");
  assert.equal(mismatch.payment?.status, "CREATED");
  assert.equal(mismatch.history.length, 0);
  assert.equal(mismatchAudit.outcome, "RECONCILIATION_REQUIRED");
  assert.equal(mismatchAudit.localOrderId, mismatchOrder.id);

  const rejectedOrder = await createOrder("badstatus");
  const rejectedEvent = await createWebhook(
    "badstatus",
    "payment.captured",
    razorpayPayload({
      eventType: "payment.captured",
      providerOrderId: rejectedOrder.providerOrderId!,
      providerPaymentId: `pay_smoke_badstatus_${runId}`,
      status: "authorized",
    }),
  );
  const rejectedResult = await processPaymentEvent(rejectedEvent.id);
  assert.equal(rejectedResult.outcome, "REJECTED");
  assert.equal(rejectedResult.code, "event_status_mismatch");
  assert.equal(
    (await prisma.order.findUniqueOrThrow({ where: { id: rejectedOrder.id } })).status,
    "PENDING",
  );

  const cancelledOrder = await createOrder("late", "CANCELLED");
  const lateEvent = await createWebhook(
    "late",
    "payment.captured",
    razorpayPayload({
      eventType: "payment.captured",
      providerOrderId: cancelledOrder.providerOrderId!,
      providerPaymentId: `pay_smoke_late_${runId}`,
    }),
  );
  const lateResult = await processPaymentEvent(lateEvent.id);
  assert.equal(lateResult.outcome, "RECONCILIATION_REQUIRED");
  assert.equal(lateResult.code, "illegal_order_state");
  assert.equal(
    (await prisma.order.findUniqueOrThrow({ where: { id: cancelledOrder.id } })).status,
    "CANCELLED",
  );

  const ignoredEvent = await createWebhook("ignored", "order.paid", {
    event: "order.paid",
    payload: {},
  });
  const ignoredResult = await processPaymentEvent(ignoredEvent.id);
  assert.equal(ignoredResult.outcome, "IGNORED");
  assert.equal(ignoredResult.code, "unsupported_event");

  console.log(
    JSON.stringify({
      status: "passed",
      captured: true,
      failed: true,
      replayIdempotent: true,
      mismatchDidNotMutateOrder: true,
      invalidPayloadRejected: true,
      lateCaptureQuarantined: true,
      unsupportedEventIgnored: true,
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
