import { prisma } from "../../config/db.js";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import {
  PAYMENT_EVENT_MAX_ATTEMPTS,
  paymentEventsQueue,
} from "../../lib/queue.js";

export type PaymentEventEnqueueOutcome =
  | "QUEUED"
  | "ALREADY_QUEUED"
  | "PROCESSED"
  | "DEAD_LETTERED";

export async function enqueuePaymentEvent(
  webhookEventId: string,
): Promise<PaymentEventEnqueueOutcome> {
  const event = await prisma.webhookEvent.findUnique({
    where: { id: webhookEventId },
    select: { processedAt: true, deadLetteredAt: true },
  });
  if (!event) throw new Error("Webhook event does not exist");
  if (event.processedAt) return "PROCESSED";
  if (event.deadLetteredAt) return "DEAD_LETTERED";

  const existing = await paymentEventsQueue.getJob(webhookEventId);
  if (existing) {
    const state = await existing.getState();
    if (
      state === "waiting" ||
      state === "active" ||
      state === "delayed" ||
      state === "prioritized"
    ) {
      return "ALREADY_QUEUED";
    }
    if (
      state === "failed" &&
      existing.attemptsMade >=
        (existing.opts.attempts ?? PAYMENT_EVENT_MAX_ATTEMPTS)
    ) {
      await prisma.webhookEvent.updateMany({
        where: {
          id: webhookEventId,
          processedAt: null,
          deadLetteredAt: null,
        },
        data: {
          deadLetteredAt: new Date(),
          deadLetterReason:
            existing.failedReason?.slice(0, 1000) ??
            "Payment event exhausted its retry limit",
        },
      });
      return "DEAD_LETTERED";
    }
    if (state === "completed" || state === "failed") {
      await existing.remove();
    } else {
      return "ALREADY_QUEUED";
    }
  }

  await paymentEventsQueue.add(
    "process",
    { webhookEventId },
    { jobId: webhookEventId },
  );
  return "QUEUED";
}

export async function recoverStalledPaymentEvents(input?: {
  now?: Date;
  batchSize?: number;
}) {
  const now = input?.now ?? new Date();
  const staleBefore = new Date(
    now.getTime() - env.WEBHOOK_RECOVERY_MIN_AGE_SECONDS * 1000,
  );
  const candidates = await prisma.webhookEvent.findMany({
    where: {
      provider: "razorpay",
      processedAt: null,
      deadLetteredAt: null,
      createdAt: { lte: staleBefore },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: input?.batchSize ?? env.WEBHOOK_RECOVERY_BATCH_SIZE,
    select: { id: true },
  });

  let queued = 0;
  let alreadyQueued = 0;
  let deadLettered = 0;
  let failed = 0;
  for (const candidate of candidates) {
    try {
      const outcome = await enqueuePaymentEvent(candidate.id);
      if (outcome === "QUEUED") queued += 1;
      else if (outcome === "ALREADY_QUEUED") alreadyQueued += 1;
      else if (outcome === "DEAD_LETTERED") deadLettered += 1;
    } catch (error) {
      failed += 1;
      logger.error(
        { err: error, webhookEventId: candidate.id },
        "stalled payment event recovery failed",
      );
    }
  }
  return {
    candidates: candidates.length,
    queued,
    alreadyQueued,
    deadLettered,
    failed,
  };
}
