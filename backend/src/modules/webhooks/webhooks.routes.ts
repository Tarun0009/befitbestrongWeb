import express, { Router, type Request, type Response } from "express";
import { prisma } from "../../config/db.js";
import { logger } from "../../config/logger.js";
import { verifyWebhookSignature } from "../../lib/razorpay.js";
import { paymentEventsQueue } from "../../lib/queue.js";

/**
 * Razorpay webhooks land here. This handler is deliberately dumb:
 *
 *   1. Verify HMAC-SHA256 signature against the raw body (constant-time compare).
 *   2. INSERT into WebhookEvent — the UNIQUE(provider, eventId) guard is the
 *      idempotency mechanism. If Razorpay retries a delivery we've already
 *      seen, the INSERT throws (P2002) and we ACK 200 without side effects.
 *   3. Enqueue a job with the WebhookEvent row id. The worker owns the actual
 *      state transitions and retries.
 *
 * The endpoint returns 200 fast so Razorpay stops retrying. Any slow work
 * happens in the background worker with BullMQ's own retry semantics.
 *
 * MOUNTED BEFORE express.json() in app.ts — this router uses express.raw so
 * the body arrives as a Buffer for signature verification.
 */

const router = Router();

// Raw body parser — capture the exact bytes for HMAC verification.
router.use(express.raw({ type: "*/*", limit: "1mb" }));

router.post("/razorpay", async (req: Request, res: Response) => {
  const signature = req.header("x-razorpay-signature");
  if (!signature) {
    logger.warn("razorpay webhook: missing signature header");
    return res.status(400).json({ error: { code: "missing_signature" } });
  }

  const rawBody = (req.body as Buffer).toString("utf8");
  if (!verifyWebhookSignature(rawBody, signature)) {
    logger.warn("razorpay webhook: signature mismatch");
    return res.status(400).json({ error: { code: "invalid_signature" } });
  }

  let payload: {
    event: string;
    payload: unknown;
    id?: string;
    created_at?: number;
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: { code: "invalid_json" } });
  }

  // Razorpay's `id` isn't always present on the outer envelope; fall back to
  // a deterministic composite id derived from event type + payment/order id.
  const eventId = extractEventId(payload);
  if (!eventId) {
    logger.warn({ event: payload.event }, "razorpay webhook: no event id");
    return res.status(400).json({ error: { code: "no_event_id" } });
  }

  try {
    const record = await prisma.webhookEvent.create({
      data: {
        provider: "razorpay",
        eventId,
        eventType: payload.event,
        signature,
        payload: payload as object,
      },
    });

    await paymentEventsQueue.add(
      "process",
      { webhookEventId: record.id },
      { jobId: record.id }, // dedupe queue-side too
    );
  } catch (err: unknown) {
    // Prisma throws P2002 for unique constraint violations — our idempotency
    // path. Log, ACK, don't retry. Any other error surfaces normally.
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      logger.info({ eventId }, "razorpay webhook: duplicate ignored");
      return res.status(200).json({ deduped: true });
    }
    logger.error({ err, eventId }, "razorpay webhook: persist failed");
    return res.status(500).json({ error: { code: "internal_error" } });
  }

  res.status(200).json({ received: true });
});

function extractEventId(payload: {
  event: string;
  payload: unknown;
  id?: string;
}): string | null {
  if (payload.id) return payload.id;
  // Razorpay payment events include a payment entity — use its id + event
  // type so retries of the same event on the same payment stay deduplicated.
  const p = payload.payload as
    | { payment?: { entity?: { id?: string } }; order?: { entity?: { id?: string } } }
    | undefined;
  const paymentId = p?.payment?.entity?.id;
  const orderId = p?.order?.entity?.id;
  const anchor = paymentId ?? orderId;
  if (!anchor) return null;
  return `${payload.event}:${anchor}`;
}

export default router;
