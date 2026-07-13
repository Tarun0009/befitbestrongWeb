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
});
