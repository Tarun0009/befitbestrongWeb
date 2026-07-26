import { Worker, type ConnectionOptions } from "bullmq";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { accountDeletionQueue } from "../lib/queue.js";
import { processDueAccountDeletions } from "../modules/account/account.service.js";

const connection: ConnectionOptions = { url: env.REDIS_URL };

export async function scheduleAccountDeletion() {
  await accountDeletionQueue.add(
    "scan",
    {},
    {
      jobId: "account-deletion-scan",
      repeat: { every: env.ACCOUNT_DELETION_SCAN_SECONDS * 1000 },
    },
  );
}

export function startAccountDeletionWorker() {
  const worker = new Worker(
    "account-deletion",
    async () => processDueAccountDeletions(),
    { connection, concurrency: 1 },
  );
  worker.on("completed", (job, result) =>
    logger.info({ jobId: job.id, ...result }, "account deletion scan completed"),
  );
  worker.on("failed", (job, error) =>
    logger.error({ jobId: job?.id, error }, "account deletion scan failed"),
  );
  worker.on("error", (error) =>
    logger.error({ error }, "account deletion worker error"),
  );
  return worker;
}
