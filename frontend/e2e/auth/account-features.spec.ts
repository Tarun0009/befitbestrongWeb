import { createHmac, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  cleanupCheckoutFixture,
  setupCheckoutFixture,
  type CheckoutFixture,
} from "../checkout/support/checkoutFixture";

const backendUrl = process.env.E2E_BACKEND_URL ?? "http://localhost:4000";
const razorpayStubUrl = process.env.E2E_RAZORPAY_URL ?? "http://127.0.0.1:4010";
const razorpayKeyId =
  process.env.E2E_RAZORPAY_KEY_ID ?? "rzp_test_e2e_checkout";
const razorpayKeySecret =
  process.env.E2E_RAZORPAY_KEY_SECRET ?? "e2e-razorpay-key-secret";
const razorpayStubAuthorization =
  `Basic ${Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString("base64")}`;
const razorpayWebhookSecret =
  process.env.E2E_RAZORPAY_WEBHOOK_SECRET ??
  "e2e-razorpay-webhook-secret";

test("customer wishlist, rewards, and subscriptions work after authenticated prepaid checkout", async ({
  context,
  page,
}) => {
  test.slow();
  const runId = randomUUID();
  const password = "Phase1-account-features";
  let fixture: CheckoutFixture | undefined;
  let cartSid: string | undefined;
  let sessionRequestCount = 0;

  page.on("request", (request) => {
    if (
      request.url() === `${backendUrl}/auth/session` &&
      request.method() === "POST"
    ) {
      sessionRequestCount += 1;
    }
  });

  await page.route("https://checkout.razorpay.com/v1/checkout.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `
        window.__e2eRazorpay = { opened: false, options: null };
        window.Razorpay = function Razorpay(options) {
          window.__e2eRazorpay.options = options;
          this.open = function open() {
            window.__e2eRazorpay.opened = true;
          };
        };
      `,
    }),
  );

  try {
    fixture = await setupCheckoutFixture("prepaid", runId);
    const addResponse = await context.request.post(`${backendUrl}/cart/items`, {
      data: { variantId: fixture.variantId, quantity: 1 },
    });
    expect(addResponse.status()).toBe(201);
    cartSid = (await context.cookies(backendUrl)).find(
      (cookie) => cookie.name === "cart_sid",
    )?.value;

    await page.goto("/signup");
    await page.getByLabel("Name").fill("Account Features Customer");
    await page.getByLabel("Email").fill(fixture.email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    const sessionPromise = page.waitForResponse(
      (response) =>
        response.url() === `${backendUrl}/auth/session` &&
        response.request().method() === "POST",
    );
    const mergePromise = page.waitForResponse(
      (response) =>
        response.url() === `${backendUrl}/cart/merge` &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Create account" }).click();
    expect((await sessionPromise).status()).toBe(200);
    expect((await mergePromise).status()).toBe(200);
    await expect(page).toHaveURL(/\/account$/);
    await expect(
      page.getByRole("heading", { name: /Welcome back, Account\./ }),
    ).toBeVisible();
    await page.waitForTimeout(750);
    expect(sessionRequestCount).toBe(1);
    // Let the signup route's client-side replacement commit before starting
    // another navigation. This prevents a still-pending /account replacement
    // from winning over the product route.
    await page.reload({ waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/account$/);

    await page.goto(`/shop/${fixture.productSlug}`, { waitUntil: "networkidle" });
    await expect(page).toHaveURL(
      new RegExp(`/shop/${fixture.productSlug}$`),
    );
    await expect(
      page.getByRole("heading", { name: fixture.productName }),
    ).toBeVisible();
    const wishlistResponsePromise = page.waitForResponse(
      (response) =>
        response.url() === `${backendUrl}/wishlist/${fixture?.productId}` &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Save for later" }).click();
    expect((await wishlistResponsePromise).status()).toBe(201);
    await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();

    await page.goto("/account/wishlist");
    await expect(
      page.getByRole("heading", { name: "Your wishlist" }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("main")
        .getByRole("link", { name: fixture.productName, exact: true }),
    ).toBeVisible();
    const cartDialog = page.getByRole("dialog", { name: "Your cart" });
    if (await cartDialog.isVisible()) {
      await cartDialog.getByRole("button", { name: "Close" }).click();
    }

    await page.goto("/checkout");
    await expect(page.getByLabel("Email")).toHaveValue(fixture.email);
    await page.getByLabel("Full name").fill("Account Features Customer");
    await page.getByLabel("Phone").fill("9999999999");
    await page
      .getByLabel("Address line 1")
      .fill("Sector 18 authenticated prepaid test");
    await page.getByLabel("PIN code").fill(fixture.pincode);
    const serviceabilityPromise = page.waitForResponse(
      (response) =>
        response.url() ===
          `${backendUrl}/serviceability/${fixture?.pincode}` &&
        response.request().method() === "GET",
    );
    await page.getByRole("button", { name: "Check" }).click();
    expect((await serviceabilityPromise).status()).toBe(200);
    await page.getByRole("button", { name: "Continue to review" }).click();
    await expect(page.getByText("Pay online", { exact: true })).toBeVisible();
    await page.waitForFunction(() => typeof window.Razorpay === "function");

    const checkoutPromise = page.waitForResponse(
      (response) =>
        response.url() === `${backendUrl}/checkout/session` &&
        response.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Pay securely with Razorpay" })
      .click();
    const checkoutResponse = await checkoutPromise;
    expect(checkoutResponse.status()).toBe(201);
    const checkout = (await checkoutResponse.json()) as {
      orderId: string;
      amount: number;
      currency: string;
      guestAccessToken: string | null;
      razorpay: { orderId: string; keyId: string };
    };
    expect(checkout).toMatchObject({
      amount: fixture.expectedTotal,
      currency: "INR",
      guestAccessToken: null,
      razorpay: { keyId: razorpayKeyId },
    });

    await expect
      .poll(() =>
        page.evaluate(() => {
          const state = (
            window as typeof window & {
              __e2eRazorpay?: { opened: boolean };
            }
          ).__e2eRazorpay;
          return state?.opened ?? false;
        }),
      )
      .toBe(true);

    const providerPaymentId = `pay_e2e_${runId.replaceAll("-", "")}`;
    const checkoutSignature = createHmac("sha256", razorpayKeySecret)
      .update(`${checkout.razorpay.orderId}|${providerPaymentId}`)
      .digest("hex");
    const registeredPayment = await context.request.post(
      `${razorpayStubUrl}/__e2e/payments`,
      {
        headers: { Authorization: razorpayStubAuthorization },
        data: {
          id: providerPaymentId,
          order_id: checkout.razorpay.orderId,
          amount: checkout.amount,
          currency: checkout.currency,
          status: "captured",
        },
      },
    );
    expect(registeredPayment.status()).toBe(201);
    await sendCapturedWebhook(
      context.request,
      runId,
      checkout,
      providerPaymentId,
    );
    await page.evaluate(
      ({ providerOrderId, paymentId, paymentSignature }) => {
        const state = (
          window as typeof window & {
            __e2eRazorpay?: {
              options: {
                handler: (response: {
                  razorpay_order_id: string;
                  razorpay_payment_id: string;
                  razorpay_signature: string;
                }) => void;
              } | null;
            };
          }
        ).__e2eRazorpay;
        if (!state?.options) throw new Error("Razorpay checkout was not opened");
        state.options.handler({
          razorpay_order_id: providerOrderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: paymentSignature,
        });
      },
      {
        providerOrderId: checkout.razorpay.orderId,
        paymentId: providerPaymentId,
        paymentSignature: checkoutSignature,
      },
    );
    await expect(page).toHaveURL(
      new RegExp(`/checkout/success\\?orderId=${checkout.orderId}$`),
    );
    await expect(page.getByText("PAID", { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    await page.goto("/account/rewards");
    await expect(
      page.getByRole("heading", { name: "1,000 points" }),
    ).toBeVisible();
    await expect(page.getByText(/Points earned from order/)).toBeVisible();
    await page.getByLabel("Points to redeem").fill("100");
    const redemptionPromise = page.waitForResponse(
      (response) =>
        response.url() === `${backendUrl}/loyalty/redeem` &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Redeem points" }).click();
    const redemptionResponse = await redemptionPromise;
    expect(redemptionResponse.status()).toBe(201);
    const redemption = (await redemptionResponse.json()) as {
      coupon: { code: string; points: number; discount: number };
    };
    expect(redemption.coupon).toMatchObject({ points: 100, discount: 1_000 });
    await expect(page.getByText(redemption.coupon.code)).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "900 points" }),
    ).toBeVisible();

    const orderDetailPromise = page.waitForResponse(
      (response) =>
        response.url() === `${backendUrl}/orders/${checkout.orderId}` &&
        response.request().method() === "GET",
    );
    const subscriptionPlansPromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        `${url.origin}${url.pathname}` === `${backendUrl}/subscription-plans` &&
        url.searchParams.get("variantId") === fixture!.variantId &&
        response.request().method() === "GET"
      );
    });
    await page.goto(`/account/orders/${checkout.orderId}`);
    expect((await orderDetailPromise).status()).toBe(200);
    expect((await subscriptionPlansPromise).status()).toBe(200);
    const enrollButton = page.getByRole("button", {
      name: "Subscribe & save 10%",
    });
    await expect(enrollButton).toBeVisible({ timeout: 15_000 });
    await enrollButton.click();
    const enrollmentPromise = page.waitForResponse(
      (response) =>
        response.url() === `${backendUrl}/subscriptions` &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Start subscription" }).click();
    const enrollmentResponse = await enrollmentPromise;
    expect(enrollmentResponse.status()).toBe(201);
    const enrollment = (await enrollmentResponse.json()) as {
      subscription: { id: string; status: string };
    };
    expect(enrollment.subscription.status).toBe("ACTIVE");

    await page.goto("/account/subscriptions");
    await expect(
      page.getByRole("main").getByText(fixture.productName),
    ).toBeVisible();
    await expect(page.getByText("ACTIVE", { exact: true })).toBeVisible();

    await controlSubscription(page, enrollment.subscription.id, "Pause", "pause");
    await expect(page.getByText("PAUSED", { exact: true })).toBeVisible();
    await controlSubscription(page, enrollment.subscription.id, "Resume", "resume");
    await expect(page.getByText("ACTIVE", { exact: true })).toBeVisible();
    await controlSubscription(page, enrollment.subscription.id, "Skip next", "skip");
    await expect(page.getByText("The next renewal was skipped.")).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await controlSubscription(page, enrollment.subscription.id, "Cancel", "cancel");
    await expect(page.getByText("CANCELLED", { exact: true })).toBeVisible();
  } finally {
    await cleanupCheckoutFixture("prepaid", runId, cartSid);
  }
});

async function sendCapturedWebhook(
  request: import("@playwright/test").APIRequestContext,
  runId: string,
  checkout: {
    orderId: string;
    amount: number;
    currency: string;
    razorpay: { orderId: string };
  },
  providerPaymentId: string,
) {
  const rawWebhook = JSON.stringify({
    id: `event_e2e_${runId.replaceAll("-", "")}`,
    entity: "event",
    event: "payment.captured",
    created_at: Math.floor(Date.now() / 1000),
    payload: {
      payment: {
        entity: {
          id: providerPaymentId,
          entity: "payment",
          order_id: checkout.razorpay.orderId,
          amount: checkout.amount,
          currency: checkout.currency,
          status: "captured",
        },
      },
    },
  });
  const signature = createHmac("sha256", razorpayWebhookSecret)
    .update(rawWebhook)
    .digest("hex");
  const response = await request.post(`${backendUrl}/webhooks/razorpay`, {
    data: rawWebhook,
    headers: {
      "Content-Type": "application/json",
      "X-Razorpay-Signature": signature,
    },
  });
  expect(response.status()).toBe(200);
  await expect(response.json()).resolves.toEqual({ received: true });
}

async function controlSubscription(
  page: import("@playwright/test").Page,
  subscriptionId: string,
  buttonName: string,
  action: "pause" | "resume" | "skip" | "cancel",
) {
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url() ===
        `${backendUrl}/subscriptions/${subscriptionId}/${action}` &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: buttonName }).click();
  expect((await responsePromise).status()).toBe(200);
}
