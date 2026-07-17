import { Worker, type ConnectionOptions } from "bullmq";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { emailOutboxQueue } from "../lib/queue.js";
import { processDueEmails } from "../modules/notifications/emailOutbox.service.js";

const connection: ConnectionOptions = { url: env.REDIS_URL };

export async function scheduleEmailOutbox() {
  await emailOutboxQueue.add(
    "scan",
    {},
    {
      jobId: "email-outbox-scan",
      repeat: { every: env.EMAIL_OUTBOX_SCAN_SECONDS * 1000 },
    },
  );
}

export function startEmailOutboxWorker() {
  const worker = new Worker(
    "email-outbox",
    async () => processDueEmails({ batchSize: env.EMAIL_OUTBOX_BATCH_SIZE }),
    { connection, concurrency: 1 },
  );
  worker.on("completed", (job, result) => {
    const context = { jobId: job.id, ...result };
    if (result.configured) {
      logger.info(context, "email outbox scan completed");
    } else {
      logger.debug(context, "email outbox scan skipped: provider not configured");
    }
  });
  worker.on("failed", (job, error) =>
    logger.error({ jobId: job?.id, error }, "email outbox scan failed"),
  );
  worker.on("error", (error) =>
    logger.error({ error }, "email outbox worker error"),
  );
  return worker;
}
