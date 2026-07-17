import express, { Router, type Request, type Response } from "express";
import { prisma } from "../../config/db.js";
import { logger } from "../../config/logger.js";
import { verifyWebhookSignature } from "../../lib/razorpay.js";
import { paymentEventsQueue } from "../../lib/queue.js";
import { courierEventsQueue } from "../../lib/queue.js";
import { env } from "../../config/env.js";
import {
  hashWebhookBody,
  parseShiprocketWebhook,
  verifyCourierWebhookToken,
} from "../fulfillment/courierTracking.js";

/**
 * Razorpay webhooks land here. This handler is deliberately dumb:
 *
 *   1. Verify HMAC-SHA256 signature against the raw body (constant-time compare).
 *   2. INSERT into WebhookEvent with ON CONFLICT DO NOTHING — the
 *      UNIQUE(provider, eventId) guard is the idempotency mechanism. A completed
 *      existing row is ACKed; an unprocessed row is safely re-enqueued to close
 *      the DB/Redis handoff gap without logging expected retries as errors.
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
  if (typeof payload.event !== "string" || payload.event.trim().length === 0) {
    return res.status(400).json({ error: { code: "invalid_event_type" } });
  }

  // Razorpay's `id` isn't always present on the outer envelope; fall back to
  // a deterministic composite id derived from event type + payment/order id.
  const eventId = extractEventId(payload);
  if (!eventId) {
    logger.warn({ event: payload.event }, "razorpay webhook: no event id");
    return res.status(400).json({ error: { code: "no_event_id" } });
  }

  let webhookEventId: string;
  let recoveredDuplicate = false;
  try {
    // ON CONFLICT DO NOTHING keeps normal provider retries out of error logs
    // while preserving the database uniqueness guard under concurrent delivery.
    const inserted = await prisma.webhookEvent.createMany({
      data: {
        provider: "razorpay",
        eventId,
        eventType: payload.event,
        signature,
        payload: payload as object,
      },
      skipDuplicates: true,
    });
    const record = await prisma.webhookEvent.findUnique({
      where: { provider_eventId: { provider: "razorpay", eventId } },
    });
    if (!record) {
      logger.error({ eventId }, "razorpay webhook: persisted row not found");
      return res.status(500).json({ error: { code: "internal_error" } });
    }
    webhookEventId = record.id;
    if (inserted.count === 0) {
      if (record.processedAt) {
        logger.info({ eventId }, "razorpay webhook: processed duplicate ignored");
        return res.status(200).json({ deduped: true });
      }
      recoveredDuplicate = true;
    }
  } catch (err: unknown) {
    logger.error({ err, eventId }, "razorpay webhook: persist failed");
    return res.status(500).json({ error: { code: "internal_error" } });
  }

  try {
    await paymentEventsQueue.add(
      "process",
      { webhookEventId },
      { jobId: webhookEventId }, // dedupe queue-side too
    );
  } catch (err) {
    // The durable row remains unprocessed. A non-2xx asks Razorpay to retry;
    // the conflict-safe path above will then re-enqueue this same row.
    logger.error(
      { err, eventId, webhookEventId },
      "razorpay webhook: enqueue failed",
    );
    return res.status(503).json({ error: { code: "queue_unavailable" } });
  }

  if (recoveredDuplicate) {
    logger.info({ eventId, webhookEventId }, "razorpay webhook: duplicate re-enqueued");
    return res.status(200).json({ deduped: true, requeued: true });
  }
  return res.status(200).json({ received: true });
});

router.post("/fulfillment", async (req: Request, res: Response) => {
  const token = req.header("x-api-key");
  if (
    env.COURIER_PROVIDER !== "shiprocket" ||
    !verifyCourierWebhookToken(token, env.SHIPROCKET_WEBHOOK_SECRET)
  ) {
    logger.warn("courier webhook: invalid or unavailable token");
    return res.status(401).json({ error: { code: "invalid_signature" } });
  }

  const rawBody = (req.body as Buffer).toString("utf8");
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: { code: "invalid_json" } });
  }

  const bodyHash = hashWebhookBody(rawBody);
  const normalized = parseShiprocketWebhook(payload, bodyHash);
  if (!normalized) {
    logger.warn("courier webhook: unsupported payload");
    return res.status(400).json({ error: { code: "unsupported_event" } });
  }

  try {
    const record = await prisma.webhookEvent.create({
      data: {
        provider: "shiprocket",
        eventId: normalized.eventId,
        eventType: normalized.status,
        payload: payload as object,
      },
    });
    await courierEventsQueue.add(
      "process",
      { webhookEventId: record.id },
      { jobId: record.id },
    );
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      logger.info(
        { eventId: normalized.eventId },
        "courier webhook: duplicate ignored",
      );
      return res.status(200).json({ deduped: true });
    }
    logger.error(
      { err, eventId: normalized.eventId },
      "courier webhook: persist failed",
    );
    return res.status(500).json({ error: { code: "internal_error" } });
  }

  return res.status(200).json({ received: true });
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
    | {
        payment?: { entity?: { id?: string } };
        order?: { entity?: { id?: string } };
        refund?: { entity?: { id?: string } };
      }
    | undefined;
  const refundId = p?.refund?.entity?.id;
  const paymentId = p?.payment?.entity?.id;
  const orderId = p?.order?.entity?.id;
  const anchor = refundId ?? paymentId ?? orderId;
  if (!anchor) return null;
  return `${payload.event}:${anchor}`;
}

export default router;
