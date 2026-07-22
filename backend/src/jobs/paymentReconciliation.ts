import { Worker, type ConnectionOptions } from "bullmq";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { paymentReconciliationQueue } from "../lib/queue.js";
import { processPendingPaymentReconciliations } from "../modules/payments/paymentReconciliation.service.js";
import { recoverStalledPaymentEvents } from "../modules/webhooks/paymentEventDelivery.service.js";

const connection: ConnectionOptions = { url: env.REDIS_URL };

export async function schedulePaymentReconciliation() {
  await paymentReconciliationQueue.add(
    "scan",
    {},
    {
      jobId: "payment-reconciliation-scan",
      repeat: {
        every: env.PAYMENT_RECONCILIATION_SCAN_SECONDS * 1000,
      },
    },
  );
}

export function startPaymentReconciliationWorker() {
  const worker = new Worker(
    "payment-reconciliation",
    async () => {
      const [payments, webhooks] = await Promise.all([
        processPendingPaymentReconciliations(),
        recoverStalledPaymentEvents(),
      ]);
      return { payments, webhooks };
    },
    { connection, concurrency: 1 },
  );
  worker.on("completed", (job, result) =>
    logger.info(
      { jobId: job.id, ...result },
      "payment reconciliation scan completed",
    ),
  );
  worker.on("failed", (job, error) =>
    logger.error(
      { jobId: job?.id, error },
      "payment reconciliation scan failed",
    ),
  );
  worker.on("error", (error) =>
    logger.error({ error }, "payment reconciliation worker error"),
  );
  return worker;
}
