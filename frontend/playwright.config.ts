import { defineConfig, devices } from "@playwright/test";

const frontendUrl = process.env.E2E_FRONTEND_URL ?? "http://localhost:3005";
const backendUrl = process.env.E2E_BACKEND_URL ?? "http://localhost:4000";
const razorpayStubUrl = process.env.E2E_RAZORPAY_URL ?? "http://127.0.0.1:4010";
const razorpayKeyId = process.env.E2E_RAZORPAY_KEY_ID ?? "rzp_test_e2e_checkout";
const razorpayKeySecret =
  process.env.E2E_RAZORPAY_KEY_SECRET ?? "e2e-razorpay-key-secret";
const razorpayWebhookSecret =
  process.env.E2E_RAZORPAY_WEBHOOK_SECRET ?? "e2e-razorpay-webhook-secret";
const reuseExistingServer = process.env.E2E_REUSE_EXISTING_SERVERS === "1";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  // Axe scans are CPU-heavy; two workers keeps local and CI runs deterministic.
  workers: 2,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: process.env.CI
    ? [
        ["github"],
        ["html", { outputFolder: "playwright-report", open: "never" }],
      ]
    : [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL: frontendUrl,
    locale: "en-IN",
    timezoneId: "Asia/Kolkata",
    colorScheme: "light",
    actionTimeout: 8_000,
    navigationTimeout: 15_000,
    trace: "retain-on-first-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: [
    {
      name: "razorpay-contract-stub",
      command: "node scripts/e2e/checkout/razorpayServer.mjs",
      cwd: "../backend",
      url: `${razorpayStubUrl}/health`,
      timeout: 30_000,
      reuseExistingServer,
      env: {
        ...process.env,
        PORT: new URL(razorpayStubUrl).port || "4010",
        E2E_RAZORPAY_KEY_ID: razorpayKeyId,
        E2E_RAZORPAY_KEY_SECRET: razorpayKeySecret,
      },
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      name: "backend",
      command: "pnpm start",
      cwd: "../backend",
      url: `${backendUrl}/health/ready`,
      timeout: 60_000,
      reuseExistingServer,
      env: {
        ...process.env,
        NODE_ENV: "development",
        RAZORPAY_KEY_ID: razorpayKeyId,
        RAZORPAY_KEY_SECRET: razorpayKeySecret,
        RAZORPAY_WEBHOOK_SECRET: razorpayWebhookSecret,
        RAZORPAY_API_BASE_URL: `${razorpayStubUrl}/v1`,
      },
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      name: "frontend",
      command: "pnpm exec next start -p 3005",
      cwd: ".",
      url: `${frontendUrl}/health`,
      timeout: 60_000,
      reuseExistingServer,
      env: { ...process.env, NODE_ENV: "production" },
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
