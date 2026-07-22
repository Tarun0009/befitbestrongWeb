export const SUPPORTED_RAZORPAY_PAYMENT_EVENTS = [
  "payment.authorized",
  "payment.captured",
  "payment.failed",
] as const;

export type SupportedRazorpayPaymentEvent =
  (typeof SUPPORTED_RAZORPAY_PAYMENT_EVENTS)[number];

export type PaymentEventOutcome =
  | "PROCESSED"
  | "IGNORED"
  | "REJECTED"
  | "RECONCILIATION_REQUIRED";

interface DecisionBase {
  outcome: PaymentEventOutcome;
  code: string;
  message: string;
  localOrderId?: string;
  providerPaymentId?: string;
}

export interface ParsedRazorpayPaymentEvent {
  eventType: SupportedRazorpayPaymentEvent;
  providerOrderId: string;
  providerPaymentId: string;
  amount: number;
  currency: string;
  providerStatus: "authorized" | "captured" | "failed";
  rawPaymentEntity: Record<string, unknown>;
}

export type ParseRazorpayPaymentEventResult =
  | { kind: "VALID"; event: ParsedRazorpayPaymentEvent }
  | ({ kind: "FINAL" } & DecisionBase);

export interface LocalPaymentSnapshot {
  orderId: string;
  orderStatus: string;
  paymentMethod: string;
  providerOrderId: string | null;
  amount: number;
  currency: string;
  payment: {
    provider: string;
    providerOrderId: string;
    providerPaymentId: string | null;
    amount: number;
    currency: string;
    status: string;
  } | null;
}

export type ValidateRazorpayPaymentEventResult =
  | ({ kind: "APPLY" } & DecisionBase & {
      targetOrderStatus: "PAID";
      targetPaymentStatus: "CAPTURED";
    })
  | ({ kind: "RECORD_ATTEMPT" } & DecisionBase & {
      targetPaymentStatus: "AUTHORIZED" | "FAILED";
    })
  | ({ kind: "FINAL" } & DecisionBase);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(
  value: unknown,
  field: string,
): { ok: true; value: string } | { ok: false; message: string } {
  if (typeof value !== "string" || value.trim().length === 0) {
    return { ok: false, message: `${field} must be a non-empty string` };
  }
  return { ok: true, value: value.trim() };
}

function final(
  outcome: Exclude<PaymentEventOutcome, "PROCESSED">,
  code: string,
  message: string,
  identifiers: Pick<DecisionBase, "localOrderId" | "providerPaymentId"> = {},
): ParseRazorpayPaymentEventResult & { kind: "FINAL" } {
  return { kind: "FINAL", outcome, code, message, ...identifiers };
}

/**
 * Parse only the two events that can change local commercial state. Unknown
 * signed events are audited as ignored; malformed supported events are
 * rejected without attempting an order lookup.
 */
export function parseRazorpayPaymentEvent(input: {
  provider: string;
  recordedEventType: string;
  payload: unknown;
}): ParseRazorpayPaymentEventResult {
  if (input.provider !== "razorpay") {
    return final(
      "REJECTED",
      "provider_mismatch",
      `Payment worker cannot process provider ${input.provider}`,
    );
  }
  if (!isRecord(input.payload)) {
    return final("REJECTED", "invalid_envelope", "Webhook payload must be an object");
  }

  const payloadEvent = requiredString(input.payload.event, "event");
  if (!payloadEvent.ok) {
    return final("REJECTED", "invalid_event_type", payloadEvent.message);
  }
  if (payloadEvent.value !== input.recordedEventType) {
    return final(
      "REJECTED",
      "event_type_mismatch",
      `Stored event type ${input.recordedEventType} does not match payload event ${payloadEvent.value}`,
    );
  }
  if (
    !SUPPORTED_RAZORPAY_PAYMENT_EVENTS.includes(
      payloadEvent.value as SupportedRazorpayPaymentEvent,
    )
  ) {
    return final(
      "IGNORED",
      "unsupported_event",
      `Event ${payloadEvent.value} does not change local payment state`,
    );
  }

  const body = input.payload.payload;
  const paymentWrapper = isRecord(body) ? body.payment : undefined;
  const entity = isRecord(paymentWrapper) ? paymentWrapper.entity : undefined;
  if (!isRecord(entity)) {
    return final(
      "REJECTED",
      "missing_payment_entity",
      "Supported payment event must contain payload.payment.entity",
    );
  }
  if (entity.entity !== undefined && entity.entity !== "payment") {
    return final(
      "REJECTED",
      "invalid_entity_type",
      "payload.payment.entity must describe a payment",
    );
  }

  const paymentId = requiredString(entity.id, "payment.id");
  const orderId = requiredString(entity.order_id, "payment.order_id");
  const currency = requiredString(entity.currency, "payment.currency");
  const status = requiredString(entity.status, "payment.status");
  const invalidString = [paymentId, orderId, currency, status].find(
    (value) => !value.ok,
  );
  if (invalidString && !invalidString.ok) {
    return final("REJECTED", "invalid_payment_entity", invalidString.message, {
      providerPaymentId: paymentId.ok ? paymentId.value : undefined,
    });
  }
  if (
    typeof entity.amount !== "number" ||
    !Number.isSafeInteger(entity.amount) ||
    entity.amount < 0
  ) {
    return final(
      "REJECTED",
      "invalid_payment_amount",
      "payment.amount must be a non-negative integer in currency subunits",
      { providerPaymentId: paymentId.ok ? paymentId.value : undefined },
    );
  }

  const providerPaymentId = paymentId.ok ? paymentId.value : "";
  const providerOrderId = orderId.ok ? orderId.value : "";
  const normalizedCurrency = currency.ok ? currency.value.toUpperCase() : "";
  const providerStatus = status.ok ? status.value.toLowerCase() : "";
  const expectedStatus =
    payloadEvent.value === "payment.captured"
      ? "captured"
      : payloadEvent.value === "payment.authorized"
        ? "authorized"
        : "failed";
  if (providerStatus !== expectedStatus) {
    return final(
      "REJECTED",
      "event_status_mismatch",
      `Event ${payloadEvent.value} requires payment status ${expectedStatus}, received ${providerStatus}`,
      { providerPaymentId },
    );
  }

  const orderWrapper = isRecord(body) ? body.order : undefined;
  if (orderWrapper !== undefined) {
    const orderEntity = isRecord(orderWrapper) ? orderWrapper.entity : undefined;
    if (!isRecord(orderEntity)) {
      return final(
        "REJECTED",
        "invalid_order_entity",
        "payload.order, when present, must contain an entity object",
        { providerPaymentId },
      );
    }
    if (orderEntity.id !== undefined && orderEntity.id !== providerOrderId) {
      return final(
        "REJECTED",
        "payload_order_id_mismatch",
        "Payment and order entities reference different provider orders",
        { providerPaymentId },
      );
    }
    if (orderEntity.amount !== undefined && orderEntity.amount !== entity.amount) {
      return final(
        "REJECTED",
        "payload_order_amount_mismatch",
        "Payment and order entities contain different amounts",
        { providerPaymentId },
      );
    }
    if (
      orderEntity.currency !== undefined &&
      (typeof orderEntity.currency !== "string" ||
        orderEntity.currency.toUpperCase() !== normalizedCurrency)
    ) {
      return final(
        "REJECTED",
        "payload_order_currency_mismatch",
        "Payment and order entities contain different currencies",
        { providerPaymentId },
      );
    }
  }

  return {
    kind: "VALID",
    event: {
      eventType: payloadEvent.value as SupportedRazorpayPaymentEvent,
      providerOrderId,
      providerPaymentId,
      amount: entity.amount,
      currency: normalizedCurrency,
      providerStatus: expectedStatus,
      rawPaymentEntity: entity,
    },
  };
}

function reconcile(
  code: string,
  message: string,
  event: ParsedRazorpayPaymentEvent,
  localOrderId?: string,
): ValidateRazorpayPaymentEventResult {
  return {
    kind: "FINAL",
    outcome: "RECONCILIATION_REQUIRED",
    code,
    message,
    localOrderId,
    providerPaymentId: event.providerPaymentId,
  };
}

/**
 * Compare a structurally valid provider event to our immutable checkout
 * values. A mismatch is operational drift, not a retryable worker failure.
 */
export function validateRazorpayPaymentEvent(
  event: ParsedRazorpayPaymentEvent,
  local: LocalPaymentSnapshot,
): ValidateRazorpayPaymentEventResult {
  const identifiers = {
    localOrderId: local.orderId,
    providerPaymentId: event.providerPaymentId,
  };
  if (local.paymentMethod !== "PREPAID") {
    return reconcile(
      "payment_method_mismatch",
      `Razorpay event resolved to ${local.paymentMethod} order`,
      event,
      local.orderId,
    );
  }
  if (local.providerOrderId !== event.providerOrderId) {
    return reconcile(
      "order_provider_id_mismatch",
      "Provider order id differs from the local order",
      event,
      local.orderId,
    );
  }
  if (!local.payment) {
    return reconcile(
      "missing_local_payment",
      "Provider event resolved to an order without a payment record",
      event,
      local.orderId,
    );
  }
  if (local.payment.provider !== "razorpay") {
    return reconcile(
      "payment_provider_mismatch",
      `Local payment provider is ${local.payment.provider}`,
      event,
      local.orderId,
    );
  }
  if (local.payment.providerOrderId !== event.providerOrderId) {
    return reconcile(
      "payment_order_id_mismatch",
      "Provider order id differs from the local payment record",
      event,
      local.orderId,
    );
  }
  if (event.amount !== local.amount || event.amount !== local.payment.amount) {
    return reconcile(
      "amount_mismatch",
      `Provider amount ${event.amount} does not match order ${local.amount} and payment ${local.payment.amount}`,
      event,
      local.orderId,
    );
  }
  const orderCurrency = local.currency.toUpperCase();
  const paymentCurrency = local.payment.currency.toUpperCase();
  if (event.currency !== orderCurrency || event.currency !== paymentCurrency) {
    return reconcile(
      "currency_mismatch",
      `Provider currency ${event.currency} does not match order ${orderCurrency} and payment ${paymentCurrency}`,
      event,
      local.orderId,
    );
  }
  const isCapture = event.eventType === "payment.captured";
  if (!isCapture) {
    return {
      kind: "RECORD_ATTEMPT",
      outcome: "PROCESSED",
      code:
        event.eventType === "payment.authorized"
          ? "payment_authorized"
          : "payment_attempt_failed",
      message:
        event.eventType === "payment.authorized"
          ? "Recorded an authorized payment attempt; awaiting capture"
          : "Recorded a failed payment attempt; order remains payable",
      targetPaymentStatus:
        event.eventType === "payment.authorized" ? "AUTHORIZED" : "FAILED",
      ...identifiers,
    };
  }

  if (
    local.payment.status === "CAPTURED" &&
    local.payment.providerPaymentId !== null &&
    local.payment.providerPaymentId !== event.providerPaymentId
  ) {
    return reconcile(
      "payment_id_mismatch",
      "Captured provider payment id differs from the local captured payment",
      event,
      local.orderId,
    );
  }

  if (local.orderStatus === "PAID") {
    if (local.payment.status !== "CAPTURED") {
      return reconcile(
        "local_state_mismatch",
        `Order is PAID but payment is ${local.payment.status}`,
        event,
        local.orderId,
      );
    }
    return {
      kind: "FINAL",
      outcome: "PROCESSED",
      code: "already_applied",
      message: "Commercial state already matches this provider event",
      ...identifiers,
    };
  }
  if (local.orderStatus !== "PENDING") {
    return reconcile(
      "illegal_order_state",
      `Cannot apply ${event.eventType} while order is ${local.orderStatus}`,
      event,
      local.orderId,
    );
  }

  const allowedPaymentStatuses = ["CREATED", "AUTHORIZED", "CAPTURED"];
  if (!allowedPaymentStatuses.includes(local.payment.status)) {
    return reconcile(
      "illegal_payment_state",
      `Cannot apply ${event.eventType} while payment is ${local.payment.status}`,
      event,
      local.orderId,
    );
  }
  return {
    kind: "APPLY",
    outcome: "PROCESSED",
    code: "payment_captured",
    message: `Validated and applied ${event.eventType}`,
    targetOrderStatus: "PAID",
    targetPaymentStatus: "CAPTURED",
    ...identifiers,
  };
}
