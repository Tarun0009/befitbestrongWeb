import { Worker } from "bullmq";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { subscriptionRenewalsQueue } from "../lib/queue.js";
import { processDueSubscriptions } from "../modules/subscriptions/subscription.service.js";

const connection = { url: env.REDIS_URL };

export async function scheduleSubscriptionRenewals() {
  await subscriptionRenewalsQueue.add(
    "scan",
    {},
    {
      jobId: "subscription-renewals-hourly",
      repeat: { every: 60 * 60 * 1000 },
    },
  );
}

export function startSubscriptionRenewalsWorker() {
  const worker = new Worker(
    "subscription-renewals",
    async () => processDueSubscriptions(),
    { connection, concurrency: 1 },
  );
  worker.on("completed", (job, result) =>
    logger.info({ jobId: job.id, processed: result.processed }, "subscription renewal scan completed"),
  );
  worker.on("failed", (job, error) =>
    logger.error({ jobId: job?.id, error }, "subscription renewal scan failed"),
  );
  worker.on("error", (error) =>
    logger.error({ error }, "subscription renewal worker error"),
  );
  return worker;
}