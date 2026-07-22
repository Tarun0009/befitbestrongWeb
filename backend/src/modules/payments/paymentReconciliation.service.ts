import { Prisma } from "@prisma/client";
import { prisma } from "../../config/db.js";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import {
  fetchRazorpayOrderPayments,
  type RazorpayPayment,
} from "../../lib/razorpay.js";
import { processPaymentEvent } from "../../jobs/paymentEvents.js";

export type PaymentReconciliationOutcome =
  | "CAPTURED"
  | "ACTIVE"
  | "UNPAID"
  | "TERMINAL";

const STATUS_PRIORITY: Record<RazorpayPayment["status"], number> = {
  captured: 0,
  authorized: 1,
  failed: 2,
  created: 3,
  refunded: 4,
};

function nextReconciliationAt(attempts: number): Date {
  const seconds = Math.min(
    env.PAYMENT_RECONCILIATION_MAX_DELAY_SECONDS,
    env.PAYMENT_RECONCILIATION_INITIAL_DELAY_SECONDS *
      2 ** Math.min(Math.max(attempts - 1, 0), 6),
  );
  return new Date(Date.now() + seconds * 1000);
}

function eventTypeForPayment(
  payment: RazorpayPayment,
): "payment.authorized" | "payment.captured" | "payment.failed" | null {
  if (payment.status === "authorized") return "payment.authorized";
  if (payment.status === "captured") return "payment.captured";
  if (payment.status === "failed") return "payment.failed";
  return null;
}

/**
 * Replays a provider snapshot through the exact same validation and
 * transactional processor used for signed webhooks. The durable event row
 * keeps callback, poller and webhook delivery at-least-once but idempotent.
 */
export async function processProviderPaymentSnapshot(
  payment: RazorpayPayment,
  source: "checkout_callback" | "reconciliation",
) {
  const eventType = eventTypeForPayment(payment);
  if (!eventType) return null;

  const eventId = eventType + ":" + payment.id;
  const payload = {
    event: eventType,
    source,
    payload: {
      payment: {
        entity: {
          ...payment.rawPayload,
          id: payment.id,
          entity: "payment",
          order_id: payment.order_id,
          amount: payment.amount,
          currency: payment.currency,
          status: payment.status,
        },
      },
    },
  };
  await prisma.webhookEvent.createMany({
    data: {
      provider: "razorpay",
      eventId,
      eventType,
      payload: payload as Prisma.InputJsonValue,
    },
    skipDuplicates: true,
  });
  const stored = await prisma.webhookEvent.findUniqueOrThrow({
    where: {
      provider_eventId: {
        provider: "razorpay",
        eventId,
      },
    },
    select: { id: true },
  });
  return processPaymentEvent(stored.id);
}

export async function reconcilePendingPayment(
  orderId: string,
): Promise<PaymentReconciliationOutcome> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { payment: true },
  });
  if (!order || order.status !== "PENDING") return "TERMINAL";
  if (
    order.paymentMethod !== "PREPAID" ||
    !order.providerOrderId ||
    !order.payment ||
    order.payment.provider !== "razorpay"
  ) {
    return "UNPAID";
  }

  const attemptNumber = order.paymentReconcileAttempts + 1;
  let payments: RazorpayPayment[];
  try {
    payments = await fetchRazorpayOrderPayments({
      orderId: order.providerOrderId,
      amount: order.total,
      currency: order.currency,
    });
  } catch (error) {
    await prisma.order.updateMany({
      where: { id: order.id, status: "PENDING" },
      data: {
        paymentReconcileAttempts: { increment: 1 },
        paymentLastReconciledAt: new Date(),
        paymentNextReconcileAt: nextReconciliationAt(attemptNumber),
      },
    });
    throw error;
  }

  const ordered = [...payments].sort(
    (left, right) =>
      STATUS_PRIORITY[left.status] - STATUS_PRIORITY[right.status],
  );
  for (const payment of ordered) {
    if (payment.status === "refunded") {
      throw new Error(
        "Pending order " + order.id + " has a refunded provider payment",
      );
    }
    const result = await processProviderPaymentSnapshot(
      payment,
      "reconciliation",
    );
    if (
      result?.outcome === "RECONCILIATION_REQUIRED" ||
      (payment.status === "captured" && result?.outcome !== "PROCESSED")
    ) {
      throw new Error(
        "Provider payment " + payment.id + " did not match local checkout data",
      );
    }
  }

  const refreshed = await prisma.order.findUnique({
    where: { id: order.id },
    select: { status: true },
  });
  if (refreshed?.status === "PAID") return "CAPTURED";
  if (!refreshed || refreshed.status !== "PENDING") return "TERMINAL";
  if (payments.some((payment) => payment.status === "captured")) {
    throw new Error(
      "Provider reports a captured payment but order " +
        order.id +
        " is still pending",
    );
  }

  const createdGraceCutoff =
    Date.now() - env.PAYMENT_CREATED_GRACE_SECONDS * 1000;
  const active = payments.some(
    (payment) =>
      payment.status === "authorized" ||
      (payment.status === "created" &&
        (payment.createdAt === null ||
          payment.createdAt * 1000 >= createdGraceCutoff)),
  );
  await prisma.order.updateMany({
    where: { id: order.id, status: "PENDING" },
    data: {
      paymentReconcileAttempts: { increment: 1 },
      paymentLastReconciledAt: new Date(),
      paymentNextReconcileAt: nextReconciliationAt(attemptNumber),
    },
  });
  return active ? "ACTIVE" : "UNPAID";
}

export async function processPendingPaymentReconciliations(input?: {
  now?: Date;
  batchSize?: number;
}) {
  const now = input?.now ?? new Date();
  const candidates = await prisma.order.findMany({
    where: {
      status: "PENDING",
      paymentMethod: "PREPAID",
      providerOrderId: { not: null },
      paymentNextReconcileAt: { lte: now },
    },
    orderBy: [{ paymentNextReconcileAt: "asc" }, { id: "asc" }],
    take: input?.batchSize ?? env.PAYMENT_RECONCILIATION_BATCH_SIZE,
    select: { id: true },
  });

  let captured = 0;
  let active = 0;
  let unpaid = 0;
  let failed = 0;
  for (const candidate of candidates) {
    try {
      const outcome = await reconcilePendingPayment(candidate.id);
      if (outcome === "CAPTURED") captured += 1;
      else if (outcome === "ACTIVE") active += 1;
      else if (outcome === "UNPAID") unpaid += 1;
    } catch (error) {
      failed += 1;
      logger.error(
        { err: error, orderId: candidate.id },
        "payment reconciliation failed",
      );
    }
  }
  return { candidates: candidates.length, captured, active, unpaid, failed };
}
