import { describe, expect, it } from "@jest/globals";
import {
  parseRazorpayPaymentEvent,
  validateRazorpayPaymentEvent,
  type LocalPaymentSnapshot,
  type ParsedRazorpayPaymentEvent,
} from "../src/modules/payments/razorpayEvent.policy.js";

function payload(overrides: Record<string, unknown> = {}) {
  return {
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: "pay_valid_1",
          order_id: "order_valid_1",
          amount: 12_500,
          currency: "INR",
          status: "captured",
          ...overrides,
        },
      },
    },
  };
}

const capturedEvent: ParsedRazorpayPaymentEvent = {
  eventType: "payment.captured",
  providerOrderId: "order_valid_1",
  providerPaymentId: "pay_valid_1",
  amount: 12_500,
  currency: "INR",
  providerStatus: "captured",
  rawPaymentEntity: {},
};

function local(
  overrides: Partial<LocalPaymentSnapshot> = {},
): LocalPaymentSnapshot {
  return {
    orderId: "local_order_1",
    orderStatus: "PENDING",
    paymentMethod: "PREPAID",
    providerOrderId: "order_valid_1",
    amount: 12_500,
    currency: "INR",
    payment: {
      provider: "razorpay",
      providerOrderId: "order_valid_1",
      providerPaymentId: null,
      amount: 12_500,
      currency: "INR",
      status: "CREATED",
    },
    ...overrides,
  };
}

describe("parseRazorpayPaymentEvent", () => {
  it("normalizes a structurally valid captured payment", () => {
    const result = parseRazorpayPaymentEvent({
      provider: "razorpay",
      recordedEventType: "payment.captured",
      payload: payload({ currency: "inr" }),
    });
    expect(result.kind).toBe("VALID");
    if (result.kind === "VALID") {
      expect(result.event).toMatchObject({
        providerOrderId: "order_valid_1",
        providerPaymentId: "pay_valid_1",
        amount: 12_500,
        currency: "INR",
        providerStatus: "captured",
      });
    }
  });

  it("audits unsupported signed events as ignored", () => {
    const result = parseRazorpayPaymentEvent({
      provider: "razorpay",
      recordedEventType: "payment.authorized",
      payload: { event: "payment.authorized", payload: {} },
    });
    expect(result).toMatchObject({
      kind: "FINAL",
      outcome: "IGNORED",
      code: "unsupported_event",
    });
  });

  it("rejects a stored/payload event type mismatch", () => {
    const result = parseRazorpayPaymentEvent({
      provider: "razorpay",
      recordedEventType: "payment.failed",
      payload: payload(),
    });
    expect(result).toMatchObject({
      kind: "FINAL",
      outcome: "REJECTED",
      code: "event_type_mismatch",
    });
  });

  it("rejects a captured event whose entity is not captured", () => {
    const result = parseRazorpayPaymentEvent({
      provider: "razorpay",
      recordedEventType: "payment.captured",
      payload: payload({ status: "authorized" }),
    });
    expect(result).toMatchObject({
      kind: "FINAL",
      outcome: "REJECTED",
      code: "event_status_mismatch",
    });
  });

  it("rejects malformed payment amounts", () => {
    const result = parseRazorpayPaymentEvent({
      provider: "razorpay",
      recordedEventType: "payment.captured",
      payload: payload({ amount: 125.5 }),
    });
    expect(result).toMatchObject({
      kind: "FINAL",
      outcome: "REJECTED",
      code: "invalid_payment_amount",
    });
  });

  it("rejects conflicting payment and order entities", () => {
    const eventPayload = payload() as Record<string, unknown>;
    const body = eventPayload.payload as Record<string, unknown>;
    body.order = { entity: { id: "order_other", amount: 12_500, currency: "INR" } };
    const result = parseRazorpayPaymentEvent({
      provider: "razorpay",
      recordedEventType: "payment.captured",
      payload: eventPayload,
    });
    expect(result).toMatchObject({
      kind: "FINAL",
      outcome: "REJECTED",
      code: "payload_order_id_mismatch",
    });
  });
});

describe("validateRazorpayPaymentEvent", () => {
  it("allows a fully matched capture to transition PENDING to PAID", () => {
    expect(validateRazorpayPaymentEvent(capturedEvent, local())).toMatchObject({
      kind: "APPLY",
      outcome: "PROCESSED",
      targetOrderStatus: "PAID",
      targetPaymentStatus: "CAPTURED",
    });
  });

  it("allows a fully matched failure to transition PENDING to FAILED", () => {
    const failed: ParsedRazorpayPaymentEvent = {
      ...capturedEvent,
      eventType: "payment.failed",
      providerStatus: "failed",
    };
    expect(validateRazorpayPaymentEvent(failed, local())).toMatchObject({
      kind: "APPLY",
      targetOrderStatus: "FAILED",
      targetPaymentStatus: "FAILED",
    });
  });

  it.each([
    ["amount_mismatch", { amount: 12_501 }],
    ["currency_mismatch", { currency: "USD" }],
    ["payment_method_mismatch", { paymentMethod: "COD" }],
  ])("requires reconciliation for %s", (code, overrides) => {
    expect(
      validateRazorpayPaymentEvent(capturedEvent, local(overrides)),
    ).toMatchObject({
      kind: "FINAL",
      outcome: "RECONCILIATION_REQUIRED",
      code,
    });
  });

  it("prevents a different provider payment id from overwriting local data", () => {
    const base = local();
    expect(
      validateRazorpayPaymentEvent(capturedEvent, {
        ...base,
        payment: { ...base.payment!, providerPaymentId: "pay_other" },
      }),
    ).toMatchObject({
      outcome: "RECONCILIATION_REQUIRED",
      code: "payment_id_mismatch",
    });
  });

  it("treats an exact already-applied capture as idempotent", () => {
    const base = local({ orderStatus: "PAID" });
    expect(
      validateRazorpayPaymentEvent(capturedEvent, {
        ...base,
        payment: {
          ...base.payment!,
          providerPaymentId: "pay_valid_1",
          status: "CAPTURED",
        },
      }),
    ).toMatchObject({
      kind: "FINAL",
      outcome: "PROCESSED",
      code: "already_applied",
    });
  });

  it("never revives a cancelled/expired order from a late capture", () => {
    expect(
      validateRazorpayPaymentEvent(
        capturedEvent,
        local({ orderStatus: "CANCELLED" }),
      ),
    ).toMatchObject({
      outcome: "RECONCILIATION_REQUIRED",
      code: "illegal_order_state",
    });
  });
});
