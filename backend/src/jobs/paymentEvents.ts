import type { PrismaClient, WebhookProcessingOutcome } from "@prisma/client";
import { Worker, type ConnectionOptions } from "bullmq";
import { prisma } from "../config/db.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import type { PaymentEventJobData } from "../lib/queue.js";
import { transition } from "../modules/orders/stateMachine.js";
import {
  parseRazorpayPaymentEvent,
  validateRazorpayPaymentEvent,
  type PaymentEventOutcome,
} from "../modules/payments/razorpayEvent.policy.js";
import { HttpError } from "../middleware/errorHandler.js";
import { applyProviderRefundOutcome } from "../modules/refunds/refund.service.js";
import { parseRazorpayRefundWebhook } from "../modules/refunds/refundWebhook.policy.js";

/**
 * Payment-events worker. Signature verification and durable de-duplication
 * happen at ingest. This worker validates provider payload and local immutable
 * checkout values before it is allowed to call the order state machine.
 */

const connection: ConnectionOptions = { url: env.REDIS_URL };

export interface PaymentEventProcessResult {
  outcome: PaymentEventOutcome;
  code: string;
  message: string;
  localOrderId?: string;
  providerPaymentId?: string;
  alreadyProcessed?: boolean;
}

interface FinalizeEventInput extends PaymentEventProcessResult {
  webhookEventId: string;
}

function auditData(result: PaymentEventProcessResult) {
  return {
    outcome: result.outcome as WebhookProcessingOutcome,
    processingCode: result.code,
    processingMessage: result.message,
    localOrderId: result.localOrderId ?? null,
    providerPaymentId: result.providerPaymentId ?? null,
    processedAt: new Date(),
  };
}

async function finalizeEvent(
  db: PrismaClient,
  input: FinalizeEventInput,
): Promise<PaymentEventProcessResult> {
  const { webhookEventId, ...result } = input;
  await db.webhookEvent.update({
    where: { id: webhookEventId },
    data: auditData(result),
  });
  return result;
}

/**
 * Process one durable webhook record. Deterministic invalid/mismatch outcomes
 * are marked complete so BullMQ does not retry poison messages. Database and
 * other transient failures still throw and use the queue's bounded retries.
 */
export async function processPaymentEvent(
  webhookEventId: string,
  db: PrismaClient = prisma,
): Promise<PaymentEventProcessResult> {
  const stored = await db.webhookEvent.findUnique({
    where: { id: webhookEventId },
  });
  if (!stored) {
    return {
      outcome: "IGNORED",
      code: "event_not_found",
      message: "Webhook event no longer exists",
    };
  }
  if (stored.processedAt) {
    return {
      outcome: stored.outcome ?? "PROCESSED",
      code: stored.processingCode ?? "already_processed",
      message: stored.processingMessage ?? "Webhook event was already processed",
      localOrderId: stored.localOrderId ?? undefined,
      providerPaymentId: stored.providerPaymentId ?? undefined,
      alreadyProcessed: true,
    };
  }

  if (stored.eventType.startsWith("refund.")) {
    const parsedRefund = parseRazorpayRefundWebhook({
      provider: stored.provider,
      recordedEventType: stored.eventType,
      payload: stored.payload,
    });
    if (parsedRefund.kind === "FINAL") {
      return finalizeEvent(db, { webhookEventId, ...parsedRefund });
    }
    const intent = await db.refundIntent.findFirst({
      where: {
        OR: [
          { providerRefundId: parsedRefund.refund.id },
          ...(parsedRefund.refundIntentId
            ? [{ id: parsedRefund.refundIntentId }]
            : []),
        ],
      },
    });
    if (!intent) {
      return finalizeEvent(db, {
        webhookEventId,
        outcome: "RECONCILIATION_REQUIRED",
        code: "refund_intent_not_found",
        message: `No local refund intent matches provider refund ${parsedRefund.refund.id}`,
        providerPaymentId: parsedRefund.refund.payment_id,
      });
    }
    try {
      await applyProviderRefundOutcome(intent.id, parsedRefund.refund, "webhook");
    } catch (error) {
      if (!(error instanceof HttpError) || error.status >= 500) throw error;
      return finalizeEvent(db, {
        webhookEventId,
        outcome: "RECONCILIATION_REQUIRED",
        code: error.code,
        message: error.message,
        localOrderId: intent.orderId,
        providerPaymentId: parsedRefund.refund.payment_id,
      });
    }
    return finalizeEvent(db, {
      webhookEventId,
      outcome: "PROCESSED",
      code: "refund_state_applied",
      message: `Validated and applied ${parsedRefund.eventType}`,
      localOrderId: intent.orderId,
      providerPaymentId: parsedRefund.refund.payment_id,
    });
  }

  const parsed = parseRazorpayPaymentEvent({
    provider: stored.provider,
    recordedEventType: stored.eventType,
    payload: stored.payload,
  });
  if (parsed.kind === "FINAL") {
    return finalizeEvent(db, { webhookEventId, ...parsed });
  }

  const providerEvent = parsed.event;
  const order = await db.order.findUnique({
    where: { providerOrderId: providerEvent.providerOrderId },
    include: { payment: true },
  });
  if (!order) {
    return finalizeEvent(db, {
      webhookEventId,
      outcome: "RECONCILIATION_REQUIRED",
      code: "order_not_found",
      message: `No local order matches provider order ${providerEvent.providerOrderId}`,
      providerPaymentId: providerEvent.providerPaymentId,
    });
  }

  const decision = validateRazorpayPaymentEvent(providerEvent, {
    orderId: order.id,
    orderStatus: order.status,
    paymentMethod: order.paymentMethod,
    providerOrderId: order.providerOrderId,
    amount: order.total,
    currency: order.currency,
    payment: order.payment,
  });
  if (decision.kind === "FINAL") {
    return finalizeEvent(db, { webhookEventId, ...decision });
  }

  const result: PaymentEventProcessResult = {
    outcome: decision.outcome,
    code: decision.code,
    message: decision.message,
    localOrderId: decision.localOrderId,
    providerPaymentId: decision.providerPaymentId,
  };
  await transition(db, order.id, decision.targetOrderStatus, {
    actor: {
      kind: "system",
      note: `validated webhook: ${providerEvent.eventType} (${stored.eventId})`,
    },
    paymentUpdate: {
      status: decision.targetPaymentStatus,
      providerPaymentId: providerEvent.providerPaymentId,
      rawPayload: providerEvent.rawPaymentEntity,
    },
    // Commit the audit outcome with the commercial transition. If either
    // write loses a race or fails, both roll back and BullMQ can safely retry.
    transactionWork: async (tx) => {
      const marked = await tx.webhookEvent.updateMany({
        where: { id: stored.id, processedAt: null },
        data: auditData(result),
      });
      if (marked.count !== 1) {
        throw new Error("Webhook event was processed concurrently");
      }
    },
  });
  return result;
}

// Only start the worker when running the API. Skip during unit tests.
export function startPaymentEventsWorker(): Worker | null {
  if (env.NODE_ENV === "test") return null;

  const worker = new Worker<PaymentEventJobData>(
    "payment-events",
    async (job) => {
      try {
        const result = await processPaymentEvent(job.data.webhookEventId);
        const logContext = {
          webhookEventId: job.data.webhookEventId,
          outcome: result.outcome,
          code: result.code,
          localOrderId: result.localOrderId,
          providerPaymentId: result.providerPaymentId,
        };
        if (result.outcome === "RECONCILIATION_REQUIRED") {
          logger.error(logContext, "payment-events: reconciliation required");
        } else if (result.outcome === "REJECTED") {
          logger.warn(logContext, "payment-events: event rejected");
        } else {
          logger.info(logContext, "payment-events: processing complete");
        }
      } catch (err) {
        logger.error(
          { err, webhookEventId: job.data.webhookEventId },
          "payment-events: transient processing failure — will retry",
        );
        throw err;
      }
    },
    { connection, concurrency: 5 },
  );

  worker.on("error", (err) => logger.error({ err }, "payment-events worker error"));
  worker.on("failed", (job, err) =>
    logger.warn({ err, jobId: job?.id }, "payment-events job failed"),
  );

  logger.info("payment-events worker started");
  return worker;
}
