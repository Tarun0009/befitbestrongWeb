import { Queue, type ConnectionOptions } from "bullmq";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

/**
 * BullMQ queue registry. Workers live in `src/jobs/`.
 *
 * The webhook endpoint's job is to ACK fast (Razorpay retries on non-2xx)
 * and hand the actual work off here. Order state changes, email sends, and
 * anything else that must happen once-per-payment run in the worker with
 * retry/backoff.
 */

// BullMQ needs a bare connection URL — it prefers { host, port, ... } but
// accepts a URL string via `connection` too. We reuse the same REDIS_URL as
// the rest of the app; BullMQ opens its own connections.
const connection: ConnectionOptions = { url: env.REDIS_URL };

export const paymentEventsQueue = new Queue("payment-events", {
  connection,
  defaultJobOptions: {
    // Retry with exponential backoff; webhooks should be at-least-once.
    attempts: 5,
    backoff: { type: "exponential", delay: 1000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 100 },
  },
});

paymentEventsQueue.on("error", (err) =>
  logger.error({ err }, "payment-events queue error"),
);

export interface PaymentEventJobData {
  webhookEventId: string; // WebhookEvent row id — worker reads full payload from DB
}
export const subscriptionRenewalsQueue = new Queue("subscription-renewals", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 100 },
  },
});

subscriptionRenewalsQueue.on("error", (err) =>
  logger.error({ err }, "subscription-renewals queue error"),
);

export interface CourierEventJobData {
  webhookEventId: string;
}

export const courierEventsQueue = new Queue<CourierEventJobData>(
  "courier-events",
  {
    connection,
    defaultJobOptions: {
      attempts: 8,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 200 },
    },
  },
);

courierEventsQueue.on("error", (err) =>
  logger.error({ err }, "courier-events queue error"),
);

export const courierReconciliationQueue = new Queue(
  "courier-reconciliation",
  {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 100 },
    },
  },
);

courierReconciliationQueue.on("error", (err) =>
  logger.error({ err }, "courier-reconciliation queue error"),
);

export const checkoutExpiryQueue = new Queue("checkout-expiry", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 100 },
  },
});

checkoutExpiryQueue.on("error", (err) =>
  logger.error({ err }, "checkout-expiry queue error"),
);

export const refundReconciliationQueue = new Queue("refund-reconciliation", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 100 },
  },
});

refundReconciliationQueue.on("error", (err) =>
  logger.error({ err }, "refund-reconciliation queue error"),
);

export const emailOutboxQueue = new Queue("email-outbox", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 100 },
  },
});

emailOutboxQueue.on("error", (err) =>
  logger.error({ err }, "email-outbox queue error"),
);
