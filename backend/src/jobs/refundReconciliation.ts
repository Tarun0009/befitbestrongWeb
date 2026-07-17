import { Worker, type ConnectionOptions } from "bullmq";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { refundReconciliationQueue } from "../lib/queue.js";
import { reconcileDueRefunds } from "../modules/refunds/refund.service.js";

const connection: ConnectionOptions = { url: env.REDIS_URL };

export async function scheduleRefundReconciliation() {
  await refundReconciliationQueue.add(
    "scan",
    {},
    {
      jobId: "refund-reconciliation-scan",
      repeat: { every: env.REFUND_RECONCILIATION_SCAN_SECONDS * 1000 },
    },
  );
}

export function startRefundReconciliationWorker() {
  const worker = new Worker(
    "refund-reconciliation",
    async () =>
      reconcileDueRefunds({
        batchSize: env.REFUND_RECONCILIATION_BATCH_SIZE,
      }),
    { connection, concurrency: 1 },
  );
  worker.on("completed", (job, result) =>
    logger.info(
      { jobId: job.id, ...result },
      "refund reconciliation scan completed",
    ),
  );
  worker.on("failed", (job, error) =>
    logger.error(
      { jobId: job?.id, error },
      "refund reconciliation scan failed",
    ),
  );
  worker.on("error", (error) =>
    logger.error({ error }, "refund reconciliation worker error"),
  );
  return worker;
}
