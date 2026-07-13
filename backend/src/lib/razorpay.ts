import crypto from "node:crypto";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { HttpError } from "../middleware/errorHandler.js";

/**
 * Thin Razorpay REST client — no SDK, just fetch. Only the two operations we
 * actually use in Phase 6 (create order, verify webhook signature). Adding
 * refunds or fetching payments later stays inside this file.
 *
 * Behavior mirrors lib/firebase.ts: if keys are absent, the client throws
 * HttpError(503) at call time, so the /checkout endpoint returns a helpful
 * error rather than crashing. Frontend can gate on `/checkout/config`.
 */

const RAZORPAY_BASE = "https://api.razorpay.com/v1";

export function isRazorpayConfigured(): boolean {
  return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
}

function requireCredentials(): { keyId: string; keySecret: string } {
  const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = env;
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    throw new HttpError(
      503,
      "payment_unavailable",
      "Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in backend/.env (see PENDING.md).",
    );
  }
  return { keyId: RAZORPAY_KEY_ID, keySecret: RAZORPAY_KEY_SECRET };
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
  status: string;
}

export async function createRazorpayOrder(input: {
  amount: number; // paise
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<RazorpayOrder> {
  const { keyId, keySecret } = requireCredentials();
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

  const res = await fetch(`${RAZORPAY_BASE}/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify({
      amount: input.amount,
      currency: input.currency,
      receipt: input.receipt,
      notes: input.notes,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    logger.error({ status: res.status, body: text }, "razorpay create order failed");
    throw new HttpError(
      502,
      "payment_gateway_error",
      "Razorpay refused to create the order",
    );
  }

  return (await res.json()) as RazorpayOrder;
}

export interface RazorpayRefund {
  id: string;
  payment_id: string;
  amount: number;
  currency: string;
  status: string;
  notes?: Record<string, string>;
}

export async function refundRazorpayPayment(input: {
  paymentId: string;
  amount?: number; // paise; omit for full refund
  notes?: Record<string, string>;
}): Promise<RazorpayRefund> {
  const { keyId, keySecret } = requireCredentials();
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

  const res = await fetch(
    `${RAZORPAY_BASE}/payments/${input.paymentId}/refund`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        ...(input.amount !== undefined ? { amount: input.amount } : {}),
        notes: input.notes,
      }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    logger.error(
      { status: res.status, body: text, paymentId: input.paymentId },
      "razorpay refund failed",
    );
    throw new HttpError(
      502,
      "payment_gateway_error",
      "Razorpay refused to refund the payment",
    );
  }

  return (await res.json()) as RazorpayRefund;
}

/**
 * Verify webhook signature. Razorpay sends `X-Razorpay-Signature` = HMAC-SHA256
 * of the raw body using the webhook secret. Constant-time compare via
 * timingSafeEqual to avoid timing attacks.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string,
): boolean {
  const secret = env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    logger.error("RAZORPAY_WEBHOOK_SECRET is missing — webhook rejected");
    return false;
  }
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  // timingSafeEqual requires equal-length buffers.
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signatureHeader, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
