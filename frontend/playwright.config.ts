import { defineConfig, devices } from "@playwright/test";

const frontendUrl = process.env.E2E_FRONTEND_URL ?? "http://localhost:3005";
const backendUrl = process.env.E2E_BACKEND_URL ?? "http://localhost:4000";
const firebaseProjectId =
  process.env.E2E_FIREBASE_PROJECT_ID ?? "demo-befitbestrong-e2e";
const firebaseApiKey = process.env.E2E_FIREBASE_API_KEY ?? "e2e-api-key";
const firebaseAuthEmulatorUrl =
  process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL ?? "http://127.0.0.1:9099";
const razorpayStubUrl = process.env.E2E_RAZORPAY_URL ?? "http://127.0.0.1:4010";
const razorpayKeyId = process.env.E2E_RAZORPAY_KEY_ID ?? "rzp_test_e2e_checkout";
const razorpayKeySecret =
  process.env.E2E_RAZORPAY_KEY_SECRET ?? "e2e-razorpay-key-secret";
const razorpayWebhookSecret =
  process.env.E2E_RAZORPAY_WEBHOOK_SECRET ?? "e2e-razorpay-webhook-secret";
const e2eRedisUrl =
  process.env.E2E_REDIS_URL ?? "redis://127.0.0.1:6381/15";
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
      name: "service-api",
      testMatch: /account-lifecycle\.security\.spec\.ts/,
    },
    {
      name: "desktop-chromium",
      testIgnore: /account-lifecycle\.security\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chromium",
      testIgnore: /account-lifecycle\.security\.spec\.ts/,
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: [
    {
      name: "firebase-auth-emulator",
      command: "node node_modules/firebase-tools/lib/bin/firebase.js emulators:start --only auth --project demo-befitbestrong-e2e --config firebase.json",
      cwd: ".",
      url: `${firebaseAuthEmulatorUrl}/emulator/v1/projects/${firebaseProjectId}/config`,
      timeout: 60_000,
      reuseExistingServer,
      env: {
        ...process.env,
        FIREBASE_CLI_DISABLE_UPDATE_CHECK: "true",
        GCLOUD_PROJECT: firebaseProjectId,
        FIREBASE_PROJECT_ID: firebaseProjectId,
      },
      stdout: "pipe",
      stderr: "pipe",
    },
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
      command: "node dist/server.js",
      cwd: "../backend",
      url: `${backendUrl}/health/ready`,
      timeout: 60_000,
      reuseExistingServer,
      env: {
        ...process.env,
        NODE_ENV: "development",
        APP_ENV: "local",
        ACCOUNT_DELETION_GRACE_DAYS: "0",
        REDIS_URL: e2eRedisUrl,
        RATE_LIMIT_AUTH_IP_MAX: "10000",
        RATE_LIMIT_AUTH_ACCOUNT_MAX: "10000",
        RATE_LIMIT_PUBLIC_IP_MAX: "10000",
        RATE_LIMIT_PUBLIC_ACCOUNT_MAX: "10000",
        RATE_LIMIT_AUTHENTICATED_IP_MAX: "10000",
        RATE_LIMIT_AUTHENTICATED_ACCOUNT_MAX: "10000",
        RATE_LIMIT_SERVICEABILITY_IP_MAX: "10000",
        RATE_LIMIT_SERVICEABILITY_ACCOUNT_MAX: "10000",
        FIREBASE_PROJECT_ID: firebaseProjectId,
        FIREBASE_AUTH_EMULATOR_HOST: new URL(firebaseAuthEmulatorUrl).host,
        GCLOUD_PROJECT: firebaseProjectId,
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
      command: process.env.CI
        ? "node node_modules/next/dist/bin/next start -p 3005"
        : "node scripts/e2e/startFrontend.mjs",
      cwd: ".",
      url: `${frontendUrl}/health`,
      timeout: process.env.CI ? 60_000 : 180_000,
      reuseExistingServer,
      env: {
        ...process.env,
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_ENV: "local",
        NEXT_PUBLIC_API_URL: backendUrl,
        NEXT_PUBLIC_SITE_URL: frontendUrl,
        NEXT_PUBLIC_FIREBASE_API_KEY: firebaseApiKey,
        NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: `${firebaseProjectId}.firebaseapp.com`,
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: firebaseProjectId,
        NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: `${firebaseProjectId}.appspot.com`,
        NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "1234567890",
        NEXT_PUBLIC_FIREBASE_APP_ID: "1:1234567890:web:e2e",
        NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL: firebaseAuthEmulatorUrl,
      },
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
