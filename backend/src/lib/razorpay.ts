import crypto from "node:crypto";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { HttpError } from "../middleware/errorHandler.js";

const RAZORPAY_BASE = "https://api.razorpay.com/v1";
const RETRYABLE_HTTP_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const REFUND_IDEMPOTENCY_PATTERN = /^[A-Za-z0-9_-]{10,}$/;

export interface RazorpayHttpPolicy {
  timeoutMs: number;
  maxAttempts: number;
  retryBaseMs: number;
  retryMaxDelayMs: number;
}

export interface RazorpayClientConfig {
  keyId: string;
  keySecret: string;
  baseUrl?: string;
  policy?: Partial<RazorpayHttpPolicy>;
}

interface RazorpayClientDependencies {
  fetchImpl?: typeof fetch;
  sleep?: (delayMs: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
}

interface ProviderResponse {
  ok: boolean;
  status: number;
  body: unknown;
  headers: Headers;
  attempts: number;
}

class RazorpayTransportError extends Error {
  readonly kind: "timeout" | "network";
  readonly attempts: number;

  constructor(kind: "timeout" | "network", attempts: number, cause: unknown) {
    super(`Razorpay ${kind} after ${attempts} attempt(s)`, { cause });
    this.name = "RazorpayTransportError";
    this.kind = kind;
    this.attempts = attempts;
  }
}

const defaultSleep = (delayMs: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, delayMs));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePolicy(
  policy: Partial<RazorpayHttpPolicy> | undefined,
): RazorpayHttpPolicy {
  return {
    timeoutMs: policy?.timeoutMs ?? 5_000,
    maxAttempts: policy?.maxAttempts ?? 3,
    retryBaseMs: policy?.retryBaseMs ?? 250,
    retryMaxDelayMs: policy?.retryMaxDelayMs ?? 2_000,
  };
}

function retryDelayMs(input: {
  attempt: number;
  retryAfter: string | null;
  policy: RazorpayHttpPolicy;
  random: () => number;
  now: () => number;
}): number {
  const { attempt, retryAfter, policy, random, now } = input;
  if (retryAfter) {
    const seconds = Number(retryAfter);
    const parsed = Number.isFinite(seconds)
      ? seconds * 1_000
      : Date.parse(retryAfter) - now();
    if (Number.isFinite(parsed) && parsed >= 0) {
      return Math.min(Math.round(parsed), policy.retryMaxDelayMs);
    }
  }
  const cap = Math.min(
    policy.retryBaseMs * 2 ** Math.max(0, attempt - 1),
    policy.retryMaxDelayMs,
  );
  // Equal jitter avoids both synchronized retries and a zero-delay hot loop.
  return Math.round(cap / 2 + random() * (cap / 2));
}

function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function safeProviderError(body: unknown): Record<string, unknown> {
  if (!isRecord(body) || !isRecord(body.error)) return {};
  const error = body.error;
  return Object.fromEntries(
    ["code", "description", "reason", "source", "step", "field"]
      .filter((key) => typeof error[key] === "string")
      .map((key) => [key, error[key]]),
  );
}

async function requestWithRetry(input: {
  url: string;
  init: RequestInit;
  operation: string;
  policy: RazorpayHttpPolicy;
  dependencies: Required<RazorpayClientDependencies>;
}): Promise<ProviderResponse> {
  const { url, init, operation, policy, dependencies } = input;
  let lastTransportError: unknown;
  let lastTransportKind: "timeout" | "network" = "network";

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
    try {
      const response = await dependencies.fetchImpl(url, {
        ...init,
        signal: AbortSignal.timeout(policy.timeoutMs),
      });
      const body = await readResponseBody(response);
      const result = {
        ok: response.ok,
        status: response.status,
        body,
        headers: response.headers,
        attempts: attempt,
      };
      if (
        response.ok ||
        !RETRYABLE_HTTP_STATUSES.has(response.status) ||
        attempt === policy.maxAttempts
      ) {
        return result;
      }

      const delayMs = retryDelayMs({
        attempt,
        retryAfter: response.headers.get("retry-after"),
        policy,
        random: dependencies.random,
        now: dependencies.now,
      });
      logger.warn(
        {
          provider: "razorpay",
          operation,
          attempt,
          maxAttempts: policy.maxAttempts,
          providerStatus: response.status,
          delayMs,
        },
        "razorpay request retry scheduled",
      );
      await dependencies.sleep(delayMs);
    } catch (error) {
      lastTransportError = error;
      lastTransportKind = isTimeoutError(error) ? "timeout" : "network";
      if (attempt === policy.maxAttempts) {
        throw new RazorpayTransportError(lastTransportKind, attempt, error);
      }
      const delayMs = retryDelayMs({
        attempt,
        retryAfter: null,
        policy,
        random: dependencies.random,
        now: dependencies.now,
      });
      logger.warn(
        {
          provider: "razorpay",
          operation,
          attempt,
          maxAttempts: policy.maxAttempts,
          failure: lastTransportKind,
          delayMs,
        },
        "razorpay request retry scheduled",
      );
      await dependencies.sleep(delayMs);
    }
  }

  throw new RazorpayTransportError(
    lastTransportKind,
    policy.maxAttempts,
    lastTransportError,
  );
}

function providerHttpError(
  operation: string,
  response: ProviderResponse,
): HttpError {
  const providerError = safeProviderError(response.body);
  logger.error(
    {
      provider: "razorpay",
      operation,
      attempts: response.attempts,
      providerStatus: response.status,
      providerError,
    },
    "razorpay request failed",
  );
  if (response.status === 429 || response.status >= 500 || response.status === 409) {
    return new HttpError(
      503,
      "payment_gateway_unavailable",
      "Payment provider is temporarily unavailable. Retry shortly.",
    );
  }
  return new HttpError(
    502,
    "payment_gateway_error",
    "Payment provider rejected the request",
  );
}

function providerTransportError(
  operation: string,
  error: RazorpayTransportError,
): HttpError {
  logger.error(
    {
      provider: "razorpay",
      operation,
      attempts: error.attempts,
      failure: error.kind,
    },
    "razorpay transport failed",
  );
  if (error.kind === "timeout") {
    return new HttpError(
      504,
      "payment_gateway_timeout",
      "Payment provider did not respond in time. Retry shortly.",
    );
  }
  return new HttpError(
    503,
    "payment_gateway_unavailable",
    "Payment provider could not be reached. Retry shortly.",
  );
}

function contractError(operation: string, message: string): HttpError {
  logger.error(
    { provider: "razorpay", operation, contractError: message },
    "razorpay response contract mismatch",
  );
  return new HttpError(
    502,
    "payment_gateway_contract_error",
    "Payment provider returned an unexpected response",
  );
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
  status: string;
}

export interface CreateRazorpayOrderInput {
  amount: number;
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
}

function parseOrder(
  body: unknown,
  expected: CreateRazorpayOrderInput,
  operation: string,
): RazorpayOrder {
  if (!isRecord(body)) throw contractError(operation, "body is not an object");
  if (typeof body.id !== "string" || !body.id) {
    throw contractError(operation, "order id is missing");
  }
  if (
    body.amount !== expected.amount ||
    typeof body.currency !== "string" ||
    body.currency.toUpperCase() !== expected.currency.toUpperCase() ||
    body.receipt !== expected.receipt ||
    typeof body.status !== "string" ||
    !["created", "attempted", "paid"].includes(body.status)
  ) {
    throw contractError(operation, "order amount, currency, receipt, or status differs");
  }
  return {
    id: body.id,
    amount: body.amount,
    currency: body.currency.toUpperCase(),
    receipt: body.receipt,
    status: body.status,
  };
}

export interface RazorpayRefund {
  id: string;
  payment_id: string;
  amount: number;
  currency: string;
  status: string;
  notes?: Record<string, string>;
}

export interface RefundRazorpayPaymentInput {
  paymentId: string;
  idempotencyKey: string;
  amount?: number;
  notes?: Record<string, string>;
}

function parseRefund(
  body: unknown,
  expected: RefundRazorpayPaymentInput,
): RazorpayRefund {
  const operation = "refund_payment";
  if (!isRecord(body)) throw contractError(operation, "body is not an object");
  if (
    typeof body.id !== "string" ||
    !body.id ||
    body.payment_id !== expected.paymentId ||
    (expected.amount !== undefined && body.amount !== expected.amount) ||
    typeof body.amount !== "number" ||
    typeof body.currency !== "string" ||
    typeof body.status !== "string"
  ) {
    throw contractError(operation, "refund identifiers, amount, currency, or status differ");
  }
  if (
    body.status !== "pending" &&
    body.status !== "processed" &&
    body.status !== "failed"
  ) {
    throw contractError(operation, `unsupported refund status ${body.status}`);
  }
  return {
    id: body.id,
    payment_id: body.payment_id,
    amount: body.amount,
    currency: body.currency,
    status: body.status,
    ...(isRecord(body.notes) ? { notes: body.notes as Record<string, string> } : {}),
  };
}

export function createRazorpayClient(
  config: RazorpayClientConfig,
  dependencies: RazorpayClientDependencies = {},
) {
  const baseUrl = (config.baseUrl ?? RAZORPAY_BASE).replace(/\/$/, "");
  const policy = normalizePolicy(config.policy);
  const deps: Required<RazorpayClientDependencies> = {
    fetchImpl: dependencies.fetchImpl ?? fetch,
    sleep: dependencies.sleep ?? defaultSleep,
    random: dependencies.random ?? Math.random,
    now: dependencies.now ?? Date.now,
  };
  const authorization = `Basic ${Buffer.from(
    `${config.keyId}:${config.keySecret}`,
  ).toString("base64")}`;
  const commonHeaders = {
    "Content-Type": "application/json",
    Authorization: authorization,
  };

  const call = (
    operation: string,
    path: string,
    init: RequestInit,
  ) =>
    requestWithRetry({
      url: `${baseUrl}${path}`,
      init,
      operation,
      policy,
      dependencies: deps,
    });

  async function findOrderByReceipt(
    expected: CreateRazorpayOrderInput,
  ): Promise<RazorpayOrder | null> {
    const query = new URLSearchParams({ receipt: expected.receipt, count: "10" });
    let response: ProviderResponse;
    try {
      response = await call("find_order_by_receipt", `/orders?${query}`, {
        method: "GET",
        headers: commonHeaders,
      });
    } catch (error) {
      if (error instanceof RazorpayTransportError) {
        throw providerTransportError("find_order_by_receipt", error);
      }
      throw error;
    }
    if (!response.ok) throw providerHttpError("find_order_by_receipt", response);
    if (!isRecord(response.body) || !Array.isArray(response.body.items)) {
      throw contractError("find_order_by_receipt", "collection items are missing");
    }
    const exact = response.body.items.filter(
      (item) => isRecord(item) && item.receipt === expected.receipt,
    );
    if (exact.length === 0) return null;
    if (exact.length !== 1) {
      throw contractError("find_order_by_receipt", "receipt resolved multiple orders");
    }
    return parseOrder(exact[0], expected, "find_order_by_receipt");
  }

  async function createOrder(
    input: CreateRazorpayOrderInput,
  ): Promise<RazorpayOrder> {
    let response: ProviderResponse;
    try {
      response = await call("create_order", "/orders", {
        method: "POST",
        headers: commonHeaders,
        body: JSON.stringify({
          amount: input.amount,
          currency: input.currency,
          receipt: input.receipt,
          notes: input.notes,
        }),
      });
    } catch (error) {
      if (!(error instanceof RazorpayTransportError)) throw error;
      // The provider may have committed before our socket timed out. Resolve
      // the unique receipt before reporting the ambiguous failure.
      try {
        const recovered = await findOrderByReceipt(input);
        if (recovered) return recovered;
      } catch (recoveryError) {
        logger.error(
          { provider: "razorpay", operation: "create_order_recovery", recoveryError },
          "razorpay order recovery failed",
        );
      }
      throw providerTransportError("create_order", error);
    }

    if (response.ok) return parseOrder(response.body, input, "create_order");
    // A retry after an accepted-but-lost response can return duplicate receipt
    // as 400. Receipt lookup converts that ambiguous response into success.
    if (
      response.status === 400 ||
      response.status === 408 ||
      response.status === 409 ||
      response.status === 429 ||
      response.status >= 500
    ) {
      const recovered = await findOrderByReceipt(input);
      if (recovered) return recovered;
    }
    throw providerHttpError("create_order", response);
  }

  async function refundPayment(
    input: RefundRazorpayPaymentInput,
  ): Promise<RazorpayRefund> {
    if (!REFUND_IDEMPOTENCY_PATTERN.test(input.idempotencyKey)) {
      throw new HttpError(
        500,
        "refund_idempotency_invalid",
        "Refund idempotency key does not meet provider requirements",
      );
    }
    let response: ProviderResponse;
    try {
      response = await call(
        "refund_payment",
        `/payments/${encodeURIComponent(input.paymentId)}/refund`,
        {
          method: "POST",
          headers: {
            ...commonHeaders,
            "X-Refund-Idempotency": input.idempotencyKey,
          },
          body: JSON.stringify({
            ...(input.amount !== undefined ? { amount: input.amount } : {}),
            notes: input.notes,
            receipt: input.idempotencyKey,
          }),
        },
      );
    } catch (error) {
      if (error instanceof RazorpayTransportError) {
        throw providerTransportError("refund_payment", error);
      }
      throw error;
    }
    if (!response.ok) throw providerHttpError("refund_payment", response);
    return parseRefund(response.body, input);
  }

  async function fetchRefund(input: {
    refundId: string;
    paymentId: string;
    amount: number;
  }): Promise<RazorpayRefund> {
    let response: ProviderResponse;
    try {
      response = await call(
        "fetch_refund",
        `/refunds/${encodeURIComponent(input.refundId)}`,
        { method: "GET", headers: commonHeaders },
      );
    } catch (error) {
      if (error instanceof RazorpayTransportError) {
        throw providerTransportError("fetch_refund", error);
      }
      throw error;
    }
    if (!response.ok) throw providerHttpError("fetch_refund", response);
    const refund = parseRefund(response.body, {
      paymentId: input.paymentId,
      amount: input.amount,
      idempotencyKey: "reconciliation-only",
    });
    if (refund.id !== input.refundId) {
      throw contractError("fetch_refund", "refund id differs");
    }
    return refund;
  }

  return { createOrder, findOrderByReceipt, refundPayment, fetchRefund };
}

export function isRazorpayConfigured(): boolean {
  return Boolean(
    env.PAYMENTS_ENABLED && env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET,
  );
}

function requireCredentials(): { keyId: string; keySecret: string } {
  const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = env;
  if (!env.PAYMENTS_ENABLED || !RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    throw new HttpError(
      503,
      "payment_unavailable",
      "Razorpay is not configured. Set its key id and key secret in backend/.env.",
    );
  }
  return { keyId: RAZORPAY_KEY_ID, keySecret: RAZORPAY_KEY_SECRET };
}

function configuredClient() {
  return createRazorpayClient({
    ...requireCredentials(),
    baseUrl: env.RAZORPAY_API_BASE_URL,
    policy: {
      timeoutMs: env.RAZORPAY_HTTP_TIMEOUT_MS,
      maxAttempts: env.RAZORPAY_HTTP_MAX_ATTEMPTS,
      retryBaseMs: env.RAZORPAY_HTTP_RETRY_BASE_MS,
    },
  });
}

export function createRazorpayOrder(
  input: CreateRazorpayOrderInput,
): Promise<RazorpayOrder> {
  return configuredClient().createOrder(input);
}

export function refundRazorpayPayment(
  input: RefundRazorpayPaymentInput,
): Promise<RazorpayRefund> {
  return configuredClient().refundPayment(input);
}

export function fetchRazorpayRefund(input: {
  refundId: string;
  paymentId: string;
  amount: number;
}): Promise<RazorpayRefund> {
  return configuredClient().fetchRefund(input);
}

/** Verify X-Razorpay-Signature against the exact raw request bytes. */
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
  const expectedBuffer = Buffer.from(expected, "utf8");
  const signatureBuffer = Buffer.from(signatureHeader, "utf8");
  if (expectedBuffer.length !== signatureBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
}
