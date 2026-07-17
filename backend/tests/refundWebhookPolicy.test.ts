import { describe, expect, it } from "@jest/globals";
import { parseRazorpayRefundWebhook } from "../src/modules/refunds/refundWebhook.policy.js";

function payload(
  event = "refund.processed",
  overrides: Record<string, unknown> = {},
) {
  return {
    event,
    payload: {
      refund: {
        entity: {
          entity: "refund",
          id: "rfnd_123",
          payment_id: "pay_123",
          amount: 4_000,
          currency: "inr",
          status: "processed",
          notes: { refundIntentId: "intent_123" },
          ...overrides,
        },
      },
    },
  };
}

describe("Razorpay refund webhook policy", () => {
  it("normalizes a valid refund and preserves its intent correlation", () => {
    const result = parseRazorpayRefundWebhook({
      provider: "razorpay",
      recordedEventType: "refund.processed",
      payload: payload(),
    });
    expect(result).toMatchObject({
      kind: "VALID",
      eventType: "refund.processed",
      refundIntentId: "intent_123",
      refund: {
        id: "rfnd_123",
        payment_id: "pay_123",
        amount: 4_000,
        currency: "INR",
        status: "processed",
      },
    });
  });

  it("rejects a stored/payload event type mismatch", () => {
    expect(
      parseRazorpayRefundWebhook({
        provider: "razorpay",
        recordedEventType: "refund.failed",
        payload: payload("refund.processed"),
      }),
    ).toMatchObject({ kind: "FINAL", outcome: "REJECTED", code: "event_type_mismatch" });
  });

  it("rejects a processed event whose entity is still pending", () => {
    expect(
      parseRazorpayRefundWebhook({
        provider: "razorpay",
        recordedEventType: "refund.processed",
        payload: payload("refund.processed", { status: "pending" }),
      }),
    ).toMatchObject({ kind: "FINAL", outcome: "REJECTED", code: "event_status_mismatch" });
  });

  it("accepts refund.created while provider processing is pending", () => {
    expect(
      parseRazorpayRefundWebhook({
        provider: "razorpay",
        recordedEventType: "refund.created",
        payload: payload("refund.created", { status: "pending" }),
      }),
    ).toMatchObject({ kind: "VALID", refund: { status: "pending" } });
  });

  it("requires a positive integer amount", () => {
    expect(
      parseRazorpayRefundWebhook({
        provider: "razorpay",
        recordedEventType: "refund.processed",
        payload: payload("refund.processed", { amount: 1.5 }),
      }),
    ).toMatchObject({ kind: "FINAL", outcome: "REJECTED", code: "invalid_refund_amount" });
  });
});
