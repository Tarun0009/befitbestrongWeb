import { describe, expect, it, jest, beforeAll, afterAll } from "@jest/globals";
import crypto from "node:crypto";

// verifyWebhookSignature reads RAZORPAY_WEBHOOK_SECRET from env via `env`,
// which validates at import time. Set the secret BEFORE the module loads.
const ORIGINAL_ENV = { ...process.env };

beforeAll(() => {
  process.env.RAZORPAY_KEY_ID = "rzp_test_example";
  process.env.RAZORPAY_KEY_SECRET = "test_key_secret";
  process.env.RAZORPAY_WEBHOOK_SECRET = "test_secret_shhh";
  process.env.DATABASE_URL ??= "postgresql://ignored:ignored@localhost:5434/x";
  process.env.REDIS_URL ??= "redis://localhost:6381";
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

function jsonResponse(
  status: number,
  body: unknown,
  headers?: Record<string, string>,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

const orderInput = {
  amount: 12_500,
  currency: "INR",
  receipt: "local_order_1234567890",
  notes: { orderId: "local_order_1234567890" },
};

const orderResponse = {
  id: "order_provider_1",
  amount: 12_500,
  currency: "INR",
  receipt: "local_order_1234567890",
  status: "created",
};

describe("Razorpay bounded HTTP client", () => {
  it("retries a transient status with bounded Retry-After and then succeeds", async () => {
    const { createRazorpayClient } = await import("../src/lib/razorpay.js");
    const delays: number[] = [];
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return calls === 1
        ? jsonResponse(429, { error: { code: "rate_limited" } }, { "retry-after": "10" })
        : jsonResponse(200, orderResponse);
    }) as typeof fetch;
    const client = createRazorpayClient(
      {
        keyId: "key",
        keySecret: "secret",
        policy: {
          timeoutMs: 100,
          maxAttempts: 2,
          retryBaseMs: 100,
          retryMaxDelayMs: 2_000,
        },
      },
      {
        fetchImpl,
        sleep: async (delay) => {
          delays.push(delay);
        },
        random: () => 0,
      },
    );

    await expect(client.createOrder(orderInput)).resolves.toMatchObject({
      id: "order_provider_1",
    });
    expect(calls).toBe(2);
    expect(delays).toEqual([2_000]);
  });

  it("recovers an accepted order after a lost response using its unique receipt", async () => {
    const { createRazorpayClient } = await import("../src/lib/razorpay.js");
    const methods: string[] = [];
    let calls = 0;
    const fetchImpl = (async (_input: unknown, init?: RequestInit) => {
      calls += 1;
      methods.push(init?.method ?? "GET");
      if (calls === 1) {
        const timeout = new Error("request timed out");
        timeout.name = "TimeoutError";
        throw timeout;
      }
      if (calls === 2) {
        return jsonResponse(400, {
          error: { code: "BAD_REQUEST_ERROR", description: "receipt already exists" },
        });
      }
      return jsonResponse(200, {
        entity: "collection",
        count: 1,
        items: [orderResponse],
      });
    }) as typeof fetch;
    const client = createRazorpayClient(
      {
        keyId: "key",
        keySecret: "secret",
        policy: { timeoutMs: 100, maxAttempts: 3, retryBaseMs: 50 },
      },
      { fetchImpl, sleep: async () => undefined, random: () => 0 },
    );

    await expect(client.createOrder(orderInput)).resolves.toEqual(orderResponse);
    expect(methods).toEqual(["POST", "POST", "GET"]);
  });

  it("sends one stable refund idempotency key across a 409 retry", async () => {
    const { createRazorpayClient } = await import("../src/lib/razorpay.js");
    const idempotencyHeaders: string[] = [];
    const bodies: string[] = [];
    let calls = 0;
    const fetchImpl = (async (_input: unknown, init?: RequestInit) => {
      calls += 1;
      idempotencyHeaders.push(
        new Headers(init?.headers).get("x-refund-idempotency") ?? "",
      );
      bodies.push(String(init?.body));
      return calls === 1
        ? jsonResponse(409, { error: { code: "request_in_progress" } })
        : jsonResponse(200, {
            id: "rfnd_provider_1",
            payment_id: "pay_provider_1",
            amount: 12_500,
            currency: "INR",
            status: "processed",
            notes: { orderId: "local_order_1" },
          });
    }) as typeof fetch;
    const client = createRazorpayClient(
      {
        keyId: "key",
        keySecret: "secret",
        policy: { timeoutMs: 100, maxAttempts: 2, retryBaseMs: 50 },
      },
      { fetchImpl, sleep: async () => undefined, random: () => 0 },
    );
    const refundInput = {
      paymentId: "pay_provider_1",
      idempotencyKey: "refund-local_order_1-full",
      amount: 12_500,
      notes: { orderId: "local_order_1" },
    };

    await expect(client.refundPayment(refundInput)).resolves.toMatchObject({
      id: "rfnd_provider_1",
      status: "processed",
    });
    expect(idempotencyHeaders).toEqual([
      refundInput.idempotencyKey,
      refundInput.idempotencyKey,
    ]);
    expect(bodies[0]).toBe(bodies[1]);
  });

  it("stops after the configured timeout attempts and returns a 504", async () => {
    const { createRazorpayClient } = await import("../src/lib/razorpay.js");
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      const timeout = new Error("request timed out");
      timeout.name = "TimeoutError";
      throw timeout;
    }) as typeof fetch;
    const client = createRazorpayClient(
      {
        keyId: "key",
        keySecret: "secret",
        policy: { timeoutMs: 100, maxAttempts: 3, retryBaseMs: 50 },
      },
      { fetchImpl, sleep: async () => undefined, random: () => 0 },
    );

    await expect(
      client.refundPayment({
        paymentId: "pay_provider_1",
        idempotencyKey: "refund-local_order_1-full",
        amount: 12_500,
      }),
    ).rejects.toMatchObject({ status: 504, code: "payment_gateway_timeout" });
    expect(calls).toBe(3);
  });

  it("does not retry a non-transient refund rejection", async () => {
    const { createRazorpayClient } = await import("../src/lib/razorpay.js");
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return jsonResponse(422, {
        error: { code: "BAD_REQUEST_ERROR", description: "refund not allowed" },
      });
    }) as typeof fetch;
    const client = createRazorpayClient(
      {
        keyId: "key",
        keySecret: "secret",
        policy: { timeoutMs: 100, maxAttempts: 3, retryBaseMs: 50 },
      },
      { fetchImpl, sleep: async () => undefined },
    );

    await expect(
      client.refundPayment({
        paymentId: "pay_provider_1",
        idempotencyKey: "refund-local_order_1-full",
        amount: 12_500,
      }),
    ).rejects.toMatchObject({ status: 502, code: "payment_gateway_error" });
    expect(calls).toBe(1);
  });

  it("rejects an invalid refund idempotency key before any provider call", async () => {
    const { createRazorpayClient } = await import("../src/lib/razorpay.js");
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return jsonResponse(200, {});
    }) as typeof fetch;
    const client = createRazorpayClient(
      { keyId: "key", keySecret: "secret" },
      { fetchImpl },
    );

    await expect(
      client.refundPayment({
        paymentId: "pay_provider_1",
        idempotencyKey: "short",
      }),
    ).rejects.toMatchObject({ status: 500, code: "refund_idempotency_invalid" });
    expect(calls).toBe(0);
  });

  it("fetches a refund for reconciliation and accepts a failed terminal result", async () => {
    const { createRazorpayClient } = await import("../src/lib/razorpay.js");
    const requestedUrls: string[] = [];
    const fetchImpl = (async (input: string | URL | Request) => {
      requestedUrls.push(String(input));
      return jsonResponse(200, {
        id: "rfnd_provider_failed",
        payment_id: "pay_provider_1",
        amount: 12_500,
        currency: "INR",
        status: "failed",
      });
    }) as typeof fetch;
    const client = createRazorpayClient(
      { keyId: "key", keySecret: "secret" },
      { fetchImpl },
    );

    await expect(
      client.fetchRefund({
        refundId: "rfnd_provider_failed",
        paymentId: "pay_provider_1",
        amount: 12_500,
      }),
    ).resolves.toMatchObject({ status: "failed" });
    expect(requestedUrls[0]).toContain("/refunds/rfnd_provider_failed");
  });
});

describe("verifyWebhookSignature", () => {
  it("accepts a valid HMAC-SHA256 over the raw body", async () => {
    const { verifyWebhookSignature } = await import(
      "../src/lib/razorpay.js"
    );
    const body = JSON.stringify({ event: "payment.captured", payload: {} });
    const sig = crypto
      .createHmac("sha256", "test_secret_shhh")
      .update(body)
      .digest("hex");

    expect(verifyWebhookSignature(body, sig)).toBe(true);
  });

  it("rejects a signature computed with the wrong secret", async () => {
    const { verifyWebhookSignature } = await import(
      "../src/lib/razorpay.js"
    );
    const body = JSON.stringify({ event: "payment.captured", payload: {} });
    const wrongSig = crypto
      .createHmac("sha256", "different_secret")
      .update(body)
      .digest("hex");

    expect(verifyWebhookSignature(body, wrongSig)).toBe(false);
  });

  it("rejects a signature that's the right length but wrong content", async () => {
    const { verifyWebhookSignature } = await import(
      "../src/lib/razorpay.js"
    );
    const body = "irrelevant";
    // Same length as a real 64-char hex digest but all zeros.
    const wrongSig = "0".repeat(64);
    expect(verifyWebhookSignature(body, wrongSig)).toBe(false);
  });

  it("rejects a shorter signature without throwing (length mismatch guard)", async () => {
    const { verifyWebhookSignature } = await import(
      "../src/lib/razorpay.js"
    );
    // timingSafeEqual would throw on unequal-length buffers — the function
    // must short-circuit to false before that.
    expect(() =>
      verifyWebhookSignature("body", "abc"),
    ).not.toThrow();
    expect(verifyWebhookSignature("body", "abc")).toBe(false);
  });

  it("refuses to verify when the webhook secret env var is missing", async () => {
    jest.resetModules();
    const saved = {
      keyId: process.env.RAZORPAY_KEY_ID,
      keySecret: process.env.RAZORPAY_KEY_SECRET,
      webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
    };
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    const { verifyWebhookSignature: verifyNoSecret } = await import(
      "../src/lib/razorpay.js"
    );
    expect(verifyNoSecret("body", "sig")).toBe(false);
    process.env.RAZORPAY_KEY_ID = saved.keyId;
    process.env.RAZORPAY_KEY_SECRET = saved.keySecret;
    process.env.RAZORPAY_WEBHOOK_SECRET = saved.webhookSecret;
  });
});


