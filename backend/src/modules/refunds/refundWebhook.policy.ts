import type { RazorpayRefund } from "../../lib/razorpay.js";
import type { PaymentEventOutcome } from "../payments/razorpayEvent.policy.js";

export const SUPPORTED_RAZORPAY_REFUND_EVENTS = [
  "refund.created",
  "refund.processed",
  "refund.failed",
] as const;

type SupportedRefundEvent = (typeof SUPPORTED_RAZORPAY_REFUND_EVENTS)[number];

interface FinalRefundWebhookResult {
  kind: "FINAL";
  outcome: Exclude<PaymentEventOutcome, "PROCESSED">;
  code: string;
  message: string;
  providerPaymentId?: string;
}

export type ParseRefundWebhookResult =
  | {
      kind: "VALID";
      eventType: SupportedRefundEvent;
      refund: RazorpayRefund;
      refundIntentId?: string;
    }
  | FinalRefundWebhookResult;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function final(
  outcome: FinalRefundWebhookResult["outcome"],
  code: string,
  message: string,
  providerPaymentId?: string,
): FinalRefundWebhookResult {
  return { kind: "FINAL", outcome, code, message, providerPaymentId };
}

function stringField(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function parseRazorpayRefundWebhook(input: {
  provider: string;
  recordedEventType: string;
  payload: unknown;
}): ParseRefundWebhookResult {
  if (input.provider !== "razorpay") {
    return final(
      "REJECTED",
      "provider_mismatch",
      `Refund worker cannot process provider ${input.provider}`,
    );
  }
  if (!isRecord(input.payload)) {
    return final("REJECTED", "invalid_envelope", "Webhook payload must be an object");
  }
  const eventType = stringField(input.payload.event);
  if (!eventType) {
    return final("REJECTED", "invalid_event_type", "event must be a non-empty string");
  }
  if (eventType !== input.recordedEventType) {
    return final(
      "REJECTED",
      "event_type_mismatch",
      `Stored event type ${input.recordedEventType} does not match payload event ${eventType}`,
    );
  }
  if (
    !SUPPORTED_RAZORPAY_REFUND_EVENTS.includes(eventType as SupportedRefundEvent)
  ) {
    return final(
      "IGNORED",
      "unsupported_refund_event",
      `Event ${eventType} does not change local refund state`,
    );
  }

  const body = input.payload.payload;
  const wrapper = isRecord(body) ? body.refund : undefined;
  const entity = isRecord(wrapper) ? wrapper.entity : undefined;
  if (!isRecord(entity)) {
    return final(
      "REJECTED",
      "missing_refund_entity",
      "Supported refund event must contain payload.refund.entity",
    );
  }
  if (entity.entity !== undefined && entity.entity !== "refund") {
    return final(
      "REJECTED",
      "invalid_entity_type",
      "payload.refund.entity must describe a refund",
    );
  }

  const id = stringField(entity.id);
  const paymentId = stringField(entity.payment_id);
  const currency = stringField(entity.currency);
  const status = stringField(entity.status)?.toLowerCase() ?? null;
  if (!id || !paymentId || !currency || !status) {
    return final(
      "REJECTED",
      "invalid_refund_entity",
      "Refund id, payment_id, currency, and status are required",
      paymentId ?? undefined,
    );
  }
  if (
    typeof entity.amount !== "number" ||
    !Number.isSafeInteger(entity.amount) ||
    entity.amount <= 0
  ) {
    return final(
      "REJECTED",
      "invalid_refund_amount",
      "refund.amount must be a positive integer in currency subunits",
      paymentId,
    );
  }
  if (!(["pending", "processed", "failed"] as const).includes(status as never)) {
    return final(
      "RECONCILIATION_REQUIRED",
      "unknown_refund_status",
      `Unsupported Razorpay refund status ${status}`,
      paymentId,
    );
  }
  if (eventType === "refund.processed" && status !== "processed") {
    return final(
      "REJECTED",
      "event_status_mismatch",
      `Event refund.processed requires status processed, received ${status}`,
      paymentId,
    );
  }
  if (eventType === "refund.failed" && status !== "failed") {
    return final(
      "REJECTED",
      "event_status_mismatch",
      `Event refund.failed requires status failed, received ${status}`,
      paymentId,
    );
  }

  const notes = isRecord(entity.notes) ? entity.notes : undefined;
  const refundIntentId = stringField(notes?.refundIntentId) ?? undefined;
  return {
    kind: "VALID",
    eventType: eventType as SupportedRefundEvent,
    refund: {
      id,
      payment_id: paymentId,
      amount: entity.amount,
      currency: currency.toUpperCase(),
      status: status as RazorpayRefund["status"],
      notes: notes as RazorpayRefund["notes"],
    },
    refundIntentId,
  };
}
