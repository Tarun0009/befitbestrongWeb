import { randomUUID } from "node:crypto";
import {
  Prisma,
  type OrderStatus,
  type PaymentStatus,
  type RefundIntent,
  type RefundIntentStatus,
} from "@prisma/client";
import { prisma } from "../../config/db.js";
import { logger } from "../../config/logger.js";
import {
  fetchRazorpayRefund,
  refundRazorpayPayment,
  type RazorpayRefund,
} from "../../lib/razorpay.js";
import { HttpError } from "../../middleware/errorHandler.js";
import { handlePartialRefundLoyalty } from "../loyalty/loyalty.service.js";
import { transition } from "../orders/stateMachine.js";
import {
  calculateRefundBalance,
  classifyRefundKind,
  mapProviderRefundStatus,
  nextRefundReconcileAt,
  refundRequestHash,
  refundRequestKeyHash,
  type RefundLedgerStatus,
} from "./refund.policy.js";

const PROCESSING_LEASE_MS = 2 * 60 * 1000;

export interface RefundProviderAdapter {
  refundPayment(input: {
    paymentId: string;
    idempotencyKey: string;
    amount: number;
    notes: Record<string, string>;
  }): Promise<RazorpayRefund>;
  fetchRefund(input: {
    refundId: string;
    paymentId: string;
    amount: number;
  }): Promise<RazorpayRefund>;
}

const defaultProvider: RefundProviderAdapter = {
  refundPayment: refundRazorpayPayment,
  fetchRefund: fetchRazorpayRefund,
};

function toPolicyStatus(status: RefundIntentStatus): RefundLedgerStatus {
  return status;
}

function providerKey(): string {
  return `refund_${randomUUID().replaceAll("-", "")}`;
}

function isDefinitiveProviderFailure(error: unknown): boolean {
  return (
    error instanceof HttpError &&
    [
      "payment_gateway_error",
      "payment_refund_failed",
      "refund_idempotency_invalid",
    ].includes(error.code)
  );
}

function publicFailure(error: unknown) {
  return error instanceof HttpError
    ? { code: error.code, message: error.message }
    : {
        code: "refund_provider_unknown",
        message: "Refund provider result is unknown and requires reconciliation",
      };
}

export async function getRefundSummary(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      payment: true,
      refundIntents: {
        orderBy: { createdAt: "desc" },
        include: { events: { orderBy: { createdAt: "desc" } } },
      },
    },
  });
  if (!order) throw new HttpError(404, "order_not_found", "Order not found");
  return {
    intents: order.refundIntents,
    summary: summarizeRefundState({
      orderStatus: order.status,
      payment: order.payment,
      intents: order.refundIntents,
    }),
  };
}

export function summarizeRefundState(input: {
  orderStatus: OrderStatus;
  payment: { amount: number; status: PaymentStatus } | null;
  intents: ReadonlyArray<{ amount: number; status: RefundIntentStatus }>;
}) {
  const paymentAmount = input.payment?.amount ?? 0;
  const balance = calculateRefundBalance(
    paymentAmount,
    input.intents.map((intent) => ({
      amount: intent.amount,
      status: toPolicyStatus(intent.status),
    })),
  );
  const statusEligible =
    input.orderStatus === "PAID" || input.orderStatus === "DELIVERED";
  const paymentEligible = input.payment?.status === "CAPTURED";
  return {
    paymentAmount,
    processedAmount: balance.processedAmount,
    pendingAmount: Math.max(0, balance.reservedAmount - balance.processedAmount),
    refundableAmount: balance.refundableAmount,
    canRefund: statusEligible && paymentEligible && balance.refundableAmount > 0,
    partialRefundAllowed: input.orderStatus === "DELIVERED",
  };
}

async function acquireRefundIntent(input: {
  orderId: string;
  requestedById: string;
  idempotencyKey: string;
  amount: number;
  reason: string;
}): Promise<RefundIntent> {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: input.orderId },
      include: { payment: true },
    });
    if (!order) throw new HttpError(404, "order_not_found", "Order not found");
    if (!order.payment) {
      throw new HttpError(409, "payment_not_found", "Order has no payment record");
    }

    // Serialize balance checks per captured payment so two admin requests
    // cannot reserve more than the available amount.
    await tx.$queryRaw`SELECT "id" FROM "Payment" WHERE "id" = ${order.payment.id} FOR UPDATE`;

    const reason = input.reason.trim();
    const keyHash = refundRequestKeyHash(input.idempotencyKey);
    const requestHash = refundRequestHash({
      orderId: order.id,
      amount: input.amount,
      currency: order.payment.currency,
      reason,
    });
    const existing = await tx.refundIntent.findUnique({
      where: { orderId_requestKeyHash: { orderId: order.id, requestKeyHash: keyHash } },
    });
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new HttpError(
          409,
          "idempotency_key_reused",
          "This refund key was already used with different details",
        );
      }
      return existing;
    }

    if (order.status !== "PAID" && order.status !== "DELIVERED") {
      throw new HttpError(
        409,
        "order_not_refundable",
        `Cannot refund an order in ${order.status} status`,
      );
    }
    if (order.payment.status !== "CAPTURED") {
      throw new HttpError(
        409,
        "payment_not_captured",
        "Only a captured payment can be refunded",
      );
    }
    if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
      throw new HttpError(
        400,
        "refund_amount_invalid",
        "Refund amount must be a positive integer in currency subunits",
      );
    }
    const intents = await tx.refundIntent.findMany({
      where: { paymentId: order.payment.id },
      select: { amount: true, status: true },
    });
    const balance = calculateRefundBalance(
      order.payment.amount,
      intents.map((intent) => ({
        amount: intent.amount,
        status: toPolicyStatus(intent.status),
      })),
    );
    if (input.amount > balance.refundableAmount) {
      throw new HttpError(
        409,
        "refund_amount_exceeds_available",
        `Only ${balance.refundableAmount} ${order.payment.currency} subunits remain refundable`,
      );
    }
    const kind = classifyRefundKind(input.amount, order.payment.amount);
    if (kind === "PARTIAL" && order.status !== "DELIVERED") {
      throw new HttpError(
        409,
        "partial_refund_requires_delivery",
        "Partial refunds are allowed only after delivery",
      );
    }
    if (order.payment.provider === "razorpay" && !order.payment.providerPaymentId) {
      throw new HttpError(
        409,
        "provider_payment_missing",
        "Captured payment has no Razorpay payment id",
      );
    }

    return tx.refundIntent.create({
      data: {
        orderId: order.id,
        paymentId: order.payment.id,
        requestedById: input.requestedById,
        requestKeyHash: keyHash,
        requestHash,
        provider: order.payment.provider,
        providerPaymentId: order.payment.providerPaymentId,
        providerIdempotencyKey: providerKey(),
        kind,
        amount: input.amount,
        currency: order.payment.currency.toUpperCase(),
        reason,
        events: {
          create: {
            fromStatus: null,
            toStatus: "REQUESTED",
            source: "admin",
            message: reason,
          },
        },
      },
    });
  });
}

async function markProcessing(intent: RefundIntent): Promise<RefundIntent | null> {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.refundIntent.updateMany({
      where: {
        id: intent.id,
        OR: [
          { status: { in: ["REQUESTED", "PENDING", "RECONCILIATION_REQUIRED"] } },
          { status: "PROCESSING", leaseExpiresAt: { lte: now } },
        ],
      },
      data: {
        status: "PROCESSING",
        attemptCount: { increment: 1 },
        lastAttemptAt: now,
        leaseExpiresAt: new Date(now.getTime() + PROCESSING_LEASE_MS),
        nextReconcileAt: null,
      },
    });
    if (claimed.count !== 1) return null;
    await tx.refundEvent.create({
      data: {
        refundIntentId: intent.id,
        fromStatus: intent.status,
        toStatus: "PROCESSING",
        source: intent.status === "REQUESTED" ? "admin" : "reconciliation",
        message: intent.providerRefundId
          ? "Checking provider refund status"
          : "Submitting idempotent provider refund",
      },
    });
    return tx.refundIntent.findUniqueOrThrow({ where: { id: intent.id } });
  });
}

async function recordProviderFailure(
  intent: RefundIntent,
  error: unknown,
): Promise<RefundIntent> {
  const definitive = isDefinitiveProviderFailure(error);
  const failure = publicFailure(error);
  const now = new Date();
  const status: RefundIntentStatus = definitive
    ? "FAILED"
    : "RECONCILIATION_REQUIRED";
  return prisma.$transaction(async (tx) => {
    const updated = await tx.refundIntent.update({
      where: { id: intent.id },
      data: {
        status,
        leaseExpiresAt: null,
        nextReconcileAt: definitive
          ? null
          : nextRefundReconcileAt(intent.attemptCount, now),
        failureCode: failure.code,
        failureMessage: failure.message,
        ...(definitive ? { failedAt: now } : {}),
      },
    });
    await tx.refundEvent.create({
      data: {
        refundIntentId: intent.id,
        fromStatus: "PROCESSING",
        toStatus: status,
        source: "provider_api",
        message: failure.message,
      },
    });
    return updated;
  });
}

function validateProviderOutcome(intent: RefundIntent, refund: RazorpayRefund) {
  if (
    refund.payment_id !== intent.providerPaymentId ||
    refund.amount !== intent.amount ||
    (refund.currency && refund.currency.toUpperCase() !== intent.currency) ||
    (intent.providerRefundId && intent.providerRefundId !== refund.id)
  ) {
    throw new HttpError(
      409,
      "refund_provider_mismatch",
      "Provider refund does not match the durable local intent",
    );
  }
  const status = mapProviderRefundStatus(refund.status);
  if (!status) {
    throw new HttpError(
      409,
      "refund_provider_status_unknown",
      `Unsupported provider refund status ${refund.status}`,
    );
  }
  return status;
}

export async function applyProviderRefundOutcome(
  refundIntentId: string,
  refund: RazorpayRefund,
  source: "provider_api" | "webhook" | "reconciliation",
): Promise<RefundIntent> {
  const initial = await prisma.refundIntent.findUnique({
    where: { id: refundIntentId },
  });
  if (!initial) {
    throw new HttpError(404, "refund_intent_not_found", "Refund intent not found");
  }
  const target = validateProviderOutcome(initial, refund);
  if (initial.status === "PROCESSED" || initial.status === "FAILED") {
    if (initial.status !== target) {
      throw new HttpError(
        409,
        "refund_terminal_state_mismatch",
        `Local refund is ${initial.status} but provider reports ${target}`,
      );
    }
    return initial;
  }

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Payment" WHERE "id" = ${initial.paymentId} FOR UPDATE`;
    const current = await tx.refundIntent.findUniqueOrThrow({
      where: { id: initial.id },
      include: { order: { select: { userId: true } }, payment: true },
    });
    if (current.status === "PROCESSED" || current.status === "FAILED") return current;

    const processedBefore = await tx.refundIntent.aggregate({
      where: {
        paymentId: current.paymentId,
        status: "PROCESSED",
        id: { not: current.id },
      },
      _sum: { amount: true },
    });
    const cumulativeProcessed =
      Number(processedBefore._sum.amount ?? 0) +
      (target === "PROCESSED" ? current.amount : 0);
    if (cumulativeProcessed > current.payment.amount) {
      throw new HttpError(
        409,
        "refund_ledger_overflow",
        "Processed refunds exceed the captured payment amount",
      );
    }
    const needsOrderFinalization =
      target === "PROCESSED" && cumulativeProcessed === current.payment.amount;
    const row = await tx.refundIntent.update({
      where: { id: current.id },
      data: {
        status: target,
        providerRefundId: refund.id,
        providerStatus: refund.status,
        rawPayload: refund as unknown as Prisma.InputJsonValue,
        leaseExpiresAt: null,
        nextReconcileAt:
          target === "PENDING"
            ? nextRefundReconcileAt(current.attemptCount, now)
            : needsOrderFinalization
              ? now
              : null,
        failureCode:
          target === "FAILED"
            ? "provider_refund_failed"
            : needsOrderFinalization
              ? "order_finalization_pending"
              : null,
        failureMessage:
          target === "FAILED"
            ? "Razorpay reported that the refund failed"
            : needsOrderFinalization
              ? "Provider refund is complete; local order finalization is pending"
              : null,
        ...(target === "PROCESSED" ? { processedAt: now } : {}),
        ...(target === "FAILED" ? { failedAt: now } : {}),
        ...(source === "reconciliation" ? { lastReconciledAt: now } : {}),
      },
    });
    await tx.refundEvent.create({
      data: {
        refundIntentId: current.id,
        fromStatus: current.status,
        toStatus: target,
        source,
        message: `Provider refund is ${refund.status}`,
        payload: refund as unknown as Prisma.InputJsonValue,
      },
    });
    if (target === "PROCESSED" && cumulativeProcessed < current.payment.amount) {
      await handlePartialRefundLoyalty(tx, {
        orderId: current.orderId,
        userId: current.order.userId,
        refundIntentId: current.id,
        cumulativeRefundedAmount: cumulativeProcessed,
        paymentAmount: current.payment.amount,
      });
    }
    return row;
  });

  if (target === "PROCESSED") {
    await finalizeFullyRefundedOrder(updated.id);
  }
  return prisma.refundIntent.findUniqueOrThrow({ where: { id: updated.id } });
}

async function finalizeFullyRefundedOrder(refundIntentId: string): Promise<void> {
  const intent = await prisma.refundIntent.findUniqueOrThrow({
    where: { id: refundIntentId },
    include: { order: true, payment: true },
  });
  const total = await prisma.refundIntent.aggregate({
    where: { paymentId: intent.paymentId, status: "PROCESSED" },
    _sum: { amount: true },
  });
  if (Number(total._sum.amount ?? 0) !== intent.payment.amount) return;
  if (intent.order.status === "REFUNDED") {
    await prisma.refundIntent.update({
      where: { id: intent.id },
      data: { nextReconcileAt: null, failureCode: null, failureMessage: null },
    });
    return;
  }
  if (intent.order.status !== "PAID" && intent.order.status !== "DELIVERED") {
    await prisma.refundIntent.update({
      where: { id: intent.id },
      data: {
        nextReconcileAt: nextRefundReconcileAt(intent.attemptCount, new Date()),
        failureCode: "order_finalization_blocked",
        failureMessage: `Fully refunded provider payment cannot finalize order from ${intent.order.status}`,
      },
    });
    return;
  }

  const refundPayload = jsonObject(intent.rawPayload);
  await transition(prisma, intent.orderId, "REFUNDED", {
    actor: {
      kind: "system",
      note: `refund ledger fully processed (${intent.id})`,
    },
    refundFinalization: {
      refundIntentId: intent.id,
      rawPayload: refundPayload,
    },
    transactionWork: async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Payment" WHERE "id" = ${intent.paymentId} FOR UPDATE`;
      const verified = await tx.refundIntent.aggregate({
        where: { paymentId: intent.paymentId, status: "PROCESSED" },
        _sum: { amount: true },
      });
      if (Number(verified._sum.amount ?? 0) !== intent.payment.amount) {
        throw new HttpError(
          409,
          "refund_total_changed",
          "Refund total changed during order finalization",
        );
      }
      await tx.refundIntent.update({
        where: { id: intent.id },
        data: { nextReconcileAt: null, failureCode: null, failureMessage: null },
      });
      await tx.refundEvent.create({
        data: {
          refundIntentId: intent.id,
          fromStatus: "PROCESSED",
          toStatus: "PROCESSED",
          source: "order_finalization",
          message: "Cumulative processed refunds finalized the order",
        },
      });
    },
  });
}

function jsonObject(value: Prisma.JsonValue | null): Prisma.JsonObject | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Prisma.JsonObject;
}

export async function processRefundIntent(
  refundIntentId: string,
  provider: RefundProviderAdapter = defaultProvider,
): Promise<RefundIntent> {
  const initial = await prisma.refundIntent.findUnique({
    where: { id: refundIntentId },
  });
  if (!initial) {
    throw new HttpError(404, "refund_intent_not_found", "Refund intent not found");
  }
  if (initial.status === "PROCESSED") {
    await finalizeFullyRefundedOrder(initial.id);
    return prisma.refundIntent.findUniqueOrThrow({ where: { id: initial.id } });
  }
  if (initial.status === "FAILED") return initial;
  if (
    initial.status === "PROCESSING" &&
    initial.leaseExpiresAt &&
    initial.leaseExpiresAt > new Date()
  ) {
    return initial;
  }

  const claimed = await markProcessing(initial);
  if (!claimed) {
    return prisma.refundIntent.findUniqueOrThrow({ where: { id: initial.id } });
  }
  let response: RazorpayRefund;
  try {
    if (claimed.provider === "razorpay") {
      if (!claimed.providerPaymentId) {
        throw new HttpError(
          409,
          "provider_payment_missing",
          "Refund intent has no Razorpay payment id",
        );
      }
      response = claimed.providerRefundId
        ? await provider.fetchRefund({
            refundId: claimed.providerRefundId,
            paymentId: claimed.providerPaymentId,
            amount: claimed.amount,
          })
        : await provider.refundPayment({
            paymentId: claimed.providerPaymentId,
            idempotencyKey: claimed.providerIdempotencyKey,
            amount: claimed.amount,
            notes: { orderId: claimed.orderId, refundIntentId: claimed.id },
          });
    } else {
      response = {
        id: `manual_${claimed.id}`,
        payment_id: claimed.providerPaymentId ?? `manual_${claimed.paymentId}`,
        amount: claimed.amount,
        currency: claimed.currency,
        status: "processed",
        notes: { orderId: claimed.orderId, refundIntentId: claimed.id },
      };
      await prisma.refundIntent.update({
        where: { id: claimed.id },
        data: { providerPaymentId: response.payment_id },
      });
      claimed.providerPaymentId = response.payment_id;
    }
  } catch (error) {
    logger.error(
      { err: error, refundIntentId: claimed.id },
      "refund intent provider processing failed",
    );
    return recordProviderFailure(claimed, error);
  }

  try {
    return await applyProviderRefundOutcome(
      claimed.id,
      response,
      claimed.providerRefundId ? "reconciliation" : "provider_api",
    );
  } catch (error) {
    const current = await prisma.refundIntent.findUniqueOrThrow({
      where: { id: claimed.id },
    });
    if (current.status === "PROCESSED") {
      // The provider outcome is immutable. A local order-finalization failure
      // remains scheduled on nextReconcileAt and must never downgrade money
      // that the provider already confirmed as refunded.
      logger.error(
        { err: error, refundIntentId: current.id },
        "processed refund awaits local order finalization",
      );
      return current;
    }
    if (current.status === "PROCESSING") {
      return recordProviderFailure(current, error);
    }
    throw error;
  }
}

export async function requestRefund(input: {
  orderId: string;
  requestedById: string;
  idempotencyKey: string;
  amount: number;
  reason: string;
}, provider: RefundProviderAdapter = defaultProvider) {
  const intent = await acquireRefundIntent(input);
  await processRefundIntent(intent.id, provider);
  return getRefundSummary(input.orderId);
}

export async function reconcileRefundIntent(
  refundIntentId: string,
  provider: RefundProviderAdapter = defaultProvider,
) {
  return processRefundIntent(refundIntentId, provider);
}

export async function reconcileDueRefunds(input: {
  now?: Date;
  batchSize?: number;
  provider?: RefundProviderAdapter;
} = {}) {
  const now = input.now ?? new Date();
  const batchSize = input.batchSize ?? 25;
  const candidates = await prisma.refundIntent.findMany({
    where: {
      OR: [
        {
          status: { in: ["PENDING", "RECONCILIATION_REQUIRED", "PROCESSED"] },
          nextReconcileAt: { lte: now },
        },
        { status: "PROCESSING", leaseExpiresAt: { lte: now } },
      ],
    },
    orderBy: { nextReconcileAt: "asc" },
    take: batchSize,
    select: { id: true },
  });
  let completed = 0;
  let failed = 0;
  for (const candidate of candidates) {
    try {
      await processRefundIntent(candidate.id, input.provider ?? defaultProvider);
      completed += 1;
    } catch (error) {
      failed += 1;
      logger.error(
        { err: error, refundIntentId: candidate.id },
        "refund reconciliation candidate failed",
      );
    }
  }
  return { candidates: candidates.length, completed, failed };
}
