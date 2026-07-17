import { Worker, type ConnectionOptions } from "bullmq";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { checkoutExpiryQueue } from "../lib/queue.js";
import { processExpiredCheckoutReservations } from "../modules/checkout/checkoutExpiry.service.js";

const connection: ConnectionOptions = { url: env.REDIS_URL };

export async function scheduleCheckoutExpiry() {
  await checkoutExpiryQueue.add(
    "scan",
    {},
    {
      jobId: "checkout-expiry-scan",
      repeat: { every: env.CHECKOUT_EXPIRY_SCAN_SECONDS * 1000 },
    },
  );
}

export function startCheckoutExpiryWorker() {
  const worker = new Worker(
    "checkout-expiry",
    async () => processExpiredCheckoutReservations(),
    { connection, concurrency: 1 },
  );
  worker.on("completed", (job, result) =>
    logger.info(
      { jobId: job.id, ...result },
      "checkout reservation expiry scan completed",
    ),
  );
  worker.on("failed", (job, error) =>
    logger.error(
      { jobId: job?.id, error },
      "checkout reservation expiry scan failed",
    ),
  );
  worker.on("error", (error) =>
    logger.error({ error }, "checkout reservation expiry worker error"),
  );
  return worker;
}
