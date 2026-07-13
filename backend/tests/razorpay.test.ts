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


