import { backendEnvSchema } from "../src/config/envSchema.js";

const localBase = {
  NODE_ENV: "development",
  APP_ENV: "local",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/app",
  REDIS_URL: "redis://localhost:6379",
  CORS_ORIGIN: "http://localhost:3005",
  FRONTEND_URL: "http://localhost:3005",
};

const deployedBase = {
  NODE_ENV: "production",
  APP_ENV: "staging",
  LOG_LEVEL: "info",
  DATABASE_URL: "postgresql://user:pass@postgres:5432/app",
  REDIS_URL: "rediss://cache.example.com:6380",
  CORS_ORIGIN: "https://staging.example.com",
  FRONTEND_URL: "https://staging.example.com",
  FIREBASE_PROJECT_ID: "project-id",
  FIREBASE_CLIENT_EMAIL: "firebase@example.com",
  FIREBASE_PRIVATE_KEY:
    "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n",
  RAZORPAY_KEY_ID: "rzp_test_example",
  RAZORPAY_KEY_SECRET: "secret",
  RAZORPAY_WEBHOOK_SECRET: "webhook-secret-123",
};

describe("backend environment policy", () => {
  it("allows optional integrations in local development", () => {
    expect(backendEnvSchema.safeParse(localBase).success).toBe(true);
  });

  it("rejects partially configured integration groups", () => {
    const result = backendEnvSchema.safeParse({
      ...localBase,
      FIREBASE_PROJECT_ID: "partial",
    });
    expect(result.success).toBe(false);
  });

  it("requires auth and payments for deployed environments", () => {
    const result = backendEnvSchema.safeParse({
      ...localBase,
      NODE_ENV: "production",
      APP_ENV: "staging",
      LOG_LEVEL: "info",
      CORS_ORIGIN: "https://staging.example.com",
      FRONTEND_URL: "https://staging.example.com",
    });
    expect(result.success).toBe(false);
  });

  it("accepts complete staging configuration with test payment keys", () => {
    expect(backendEnvSchema.safeParse(deployedBase).success).toBe(true);
  });

  it("requires live payment keys and HTTPS origins in production", () => {
    const result = backendEnvSchema.safeParse({
      ...deployedBase,
      APP_ENV: "production",
      RAZORPAY_KEY_ID: "rzp_test_example",
      FRONTEND_URL: "http://localhost:3005",
    });
    expect(result.success).toBe(false);
  });

  it("requires both email values when delivery is mandatory", () => {
    const result = backendEnvSchema.safeParse({
      ...localBase,
      EMAIL_DELIVERY_REQUIRED: "true",
      RESEND_API_KEY: "re_example",
    });
    expect(result.success).toBe(false);
  });

  it("requires a complete Shiprocket group only when it is selected", () => {
    expect(
      backendEnvSchema.safeParse({
        ...localBase,
        COURIER_PROVIDER: "shiprocket",
        SHIPROCKET_EMAIL: "ops@example.com",
      }).success,
    ).toBe(false);

    expect(
      backendEnvSchema.safeParse({
        ...localBase,
        COURIER_PROVIDER: "shiprocket",
        SHIPROCKET_EMAIL: "ops@example.com",
        SHIPROCKET_PASSWORD: "strong-password",
        SHIPROCKET_PICKUP_LOCATION: "Primary Warehouse",
        SHIPROCKET_PICKUP_PINCODE: "201301",
        SHIPROCKET_WEBHOOK_SECRET: "0123456789abcdef",
      }).success,
    ).toBe(true);
  });

  it("bounds checkout reservation and expiry worker settings", () => {
    expect(
      backendEnvSchema.safeParse({
        ...localBase,
        CHECKOUT_RESERVATION_MINUTES: "15",
        CHECKOUT_EXPIRY_SCAN_SECONDS: "60",
        CHECKOUT_EXPIRY_BATCH_SIZE: "50",
      }).success,
    ).toBe(true);
    expect(
      backendEnvSchema.safeParse({
        ...localBase,
        CHECKOUT_RESERVATION_MINUTES: "1",
      }).success,
    ).toBe(false);
    expect(
      backendEnvSchema.safeParse({
        ...localBase,
        CHECKOUT_EXPIRY_BATCH_SIZE: "1000",
      }).success,
    ).toBe(false);
  });

  it("bounds Razorpay timeout and retry settings", () => {
    const parsed = backendEnvSchema.parse({
      ...localBase,
      RAZORPAY_HTTP_TIMEOUT_MS: "5000",
      RAZORPAY_HTTP_MAX_ATTEMPTS: "3",
      RAZORPAY_HTTP_RETRY_BASE_MS: "250",
    });
    expect(parsed.RAZORPAY_HTTP_TIMEOUT_MS).toBe(5000);
    expect(parsed.RAZORPAY_HTTP_MAX_ATTEMPTS).toBe(3);
    expect(parsed.RAZORPAY_HTTP_RETRY_BASE_MS).toBe(250);
    expect(parsed.RAZORPAY_API_BASE_URL).toBe("https://api.razorpay.com/v1");
    expect(
      backendEnvSchema.safeParse({
        ...localBase,
        RAZORPAY_API_BASE_URL: "http://127.0.0.1:4010/v1",
      }).success,
    ).toBe(true);
    expect(
      backendEnvSchema.safeParse({
        ...deployedBase,
        RAZORPAY_API_BASE_URL: "https://payments.example.test/v1",
      }).success,
    ).toBe(false);
    expect(
      backendEnvSchema.safeParse({
        ...localBase,
        RAZORPAY_HTTP_TIMEOUT_MS: "60",
      }).success,
    ).toBe(false);
    expect(
      backendEnvSchema.safeParse({
        ...localBase,
        RAZORPAY_HTTP_MAX_ATTEMPTS: "10",
      }).success,
    ).toBe(false);
  });

  it("bounds refund reconciliation worker settings", () => {
    const parsed = backendEnvSchema.parse({
      ...localBase,
      REFUND_RECONCILIATION_SCAN_SECONDS: "300",
      REFUND_RECONCILIATION_BATCH_SIZE: "25",
    });
    expect(parsed.REFUND_RECONCILIATION_SCAN_SECONDS).toBe(300);
    expect(parsed.REFUND_RECONCILIATION_BATCH_SIZE).toBe(25);
    expect(
      backendEnvSchema.safeParse({
        ...localBase,
        REFUND_RECONCILIATION_SCAN_SECONDS: "30",
      }).success,
    ).toBe(false);
    expect(
      backendEnvSchema.safeParse({
        ...localBase,
        REFUND_RECONCILIATION_BATCH_SIZE: "101",
      }).success,
    ).toBe(false);
  });

  it("bounds email delivery worker and provider settings", () => {
    const parsed = backendEnvSchema.parse({
      ...localBase,
      EMAIL_HTTP_TIMEOUT_MS: "8000",
      EMAIL_OUTBOX_SCAN_SECONDS: "30",
      EMAIL_OUTBOX_BATCH_SIZE: "25",
      EMAIL_OUTBOX_MAX_ATTEMPTS: "8",
    });
    expect(parsed.EMAIL_HTTP_TIMEOUT_MS).toBe(8000);
    expect(parsed.EMAIL_OUTBOX_SCAN_SECONDS).toBe(30);
    expect(parsed.EMAIL_OUTBOX_BATCH_SIZE).toBe(25);
    expect(parsed.EMAIL_OUTBOX_MAX_ATTEMPTS).toBe(8);
    expect(
      backendEnvSchema.safeParse({ ...localBase, EMAIL_HTTP_TIMEOUT_MS: "100" })
        .success,
    ).toBe(false);
    expect(
      backendEnvSchema.safeParse({ ...localBase, EMAIL_OUTBOX_SCAN_SECONDS: "5" })
        .success,
    ).toBe(false);
    expect(
      backendEnvSchema.safeParse({ ...localBase, EMAIL_OUTBOX_BATCH_SIZE: "101" })
        .success,
    ).toBe(false);
    expect(
      backendEnvSchema.safeParse({ ...localBase, EMAIL_OUTBOX_MAX_ATTEMPTS: "21" })
        .success,
    ).toBe(false);
  });
});
