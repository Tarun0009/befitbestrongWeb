import { Worker, type ConnectionOptions } from "bullmq";
import { prisma } from "../config/db.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import type { PaymentEventJobData } from "../lib/queue.js";
import { transition } from "../modules/orders/stateMachine.js";

/**
 * Payment-events worker. Runs the actual state transition triggered by a
 * Razorpay webhook. The webhook route ACKs Razorpay in <100ms; this worker
 * takes as long as it needs and retries with exponential backoff on failure.
 *
 * The webhook route already de-dupes at INSERT time via UNIQUE(provider,
 * eventId). This worker additionally checks `WebhookEvent.processedAt` so
 * that if a job is redelivered by BullMQ (crash/restart), we don't apply
 * the same transition twice.
 */

const connection: ConnectionOptions = { url: env.REDIS_URL };

// Only start the worker when running the API — a plain `tsx watch src/server.ts`
// call boots this. Skip during unit tests (NODE_ENV=test).
export function startPaymentEventsWorker(): Worker | null {
  if (env.NODE_ENV === "test") return null;

  const worker = new Worker<PaymentEventJobData>(
    "payment-events",
    async (job) => {
      const event = await prisma.webhookEvent.findUnique({
        where: { id: job.data.webhookEventId },
      });
      if (!event) {
        logger.warn(
          { webhookEventId: job.data.webhookEventId },
          "payment-events: event row vanished",
        );
        return;
      }
      if (event.processedAt) {
        logger.info(
          { eventId: event.eventId },
          "payment-events: already processed, no-op",
        );
        return;
      }

      const payload = event.payload as unknown as {
        event: string;
        payload: {
          payment?: { entity?: RazorpayPaymentEntity };
          order?: { entity?: RazorpayOrderEntity };
        };
      };

      try {
        await handleEvent(payload);
        await prisma.webhookEvent.update({
          where: { id: event.id },
          data: { processedAt: new Date() },
        });
        logger.info(
          { eventId: event.eventId, eventType: event.eventType },
          "payment-events: processed",
        );
      } catch (err) {
        logger.error(
          { err, eventId: event.eventId, eventType: event.eventType },
          "payment-events: processing failed — will retry",
        );
        throw err; // let BullMQ retry with backoff
      }
    },
    {
      connection,
      concurrency: 5,
    },
  );

  worker.on("error", (err) => logger.error({ err }, "payment-events worker error"));
  worker.on("failed", (job, err) =>
    logger.warn({ err, jobId: job?.id }, "payment-events job failed"),
  );

  logger.info("payment-events worker started");
  return worker;
}

interface RazorpayPaymentEntity {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: string;
  method?: string;
}

interface RazorpayOrderEntity {
  id: string;
  amount: number;
  currency: string;
  status: string;
}

async function handleEvent(payload: {
  event: string;
  payload: {
    payment?: { entity?: RazorpayPaymentEntity };
    order?: { entity?: RazorpayOrderEntity };
  };
}): Promise<void> {
  const paymentEntity = payload.payload.payment?.entity;
  const providerOrderId =
    paymentEntity?.order_id ?? payload.payload.order?.entity?.id;
  if (!providerOrderId) return;

  const order = await prisma.order.findUnique({
    where: { providerOrderId },
  });
  if (!order) {
    logger.warn(
      { providerOrderId, event: payload.event },
      "payment-events: no matching order",
    );
    return;
  }

  switch (payload.event) {
    case "payment.captured": {
      // skipSideEffects: PAID doesn't release stock — the state machine's
      // release-stock rule only fires on CANCELLED/FAILED/REFUNDED.
      await transition(prisma, order.id, "PAID", {
        actor: { kind: "system", note: `webhook: ${payload.event}` },
        paymentUpdate: {
          status: "CAPTURED",
          providerPaymentId: paymentEntity?.id,
          rawPayload: paymentEntity as object,
        },
      });
      break;
    }
    case "payment.failed": {
      await transition(prisma, order.id, "FAILED", {
        actor: { kind: "system", note: `webhook: ${payload.event}` },
        paymentUpdate: {
          status: "FAILED",
          providerPaymentId: paymentEntity?.id,
          rawPayload: paymentEntity as object,
        },
      });
      break;
    }
    default:
      // Ignore other events (payment.authorized, order.paid, refund.*, etc.).
      // Adding one is a matter of mapping the event to a state machine call.
      logger.debug(
        { event: payload.event, orderId: order.id },
        "payment-events: event ignored",
      );
  }
}
