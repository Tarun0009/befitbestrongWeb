import { createHmac, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  cleanupCheckoutFixture,
  setupCheckoutFixture,
  type CheckoutFixture,
} from "./support/checkoutFixture";

const backendUrl = process.env.E2E_BACKEND_URL ?? "http://localhost:4000";
const razorpayKeyId =
  process.env.E2E_RAZORPAY_KEY_ID ?? "rzp_test_e2e_checkout";
const razorpayWebhookSecret =
  process.env.E2E_RAZORPAY_WEBHOOK_SECRET ??
  "e2e-razorpay-webhook-secret";

test("guest prepaid checkout reaches Razorpay and completes from a signed webhook", async ({
  context,
  page,
}) => {
  test.slow();
  const runId = randomUUID();
  let fixture: CheckoutFixture | undefined;
  let cartSid: string | undefined;

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
    expect(cartSid).toBeTruthy();

    await page.goto("/checkout");
    await expect(
      page.getByRole("heading", { name: "Complete your order" }),
    ).toBeVisible();
    await expect(
      page.getByRole("main").getByText(fixture.productName),
    ).toBeVisible();

    await page.getByLabel("Email").fill(fixture.email);
    await page.getByLabel("Full name").fill("Phase 13C Prepaid Guest");
    await page.getByLabel("Phone").fill("9999999999");
    await page.getByLabel("Address line 1").fill("Sector 18 prepaid test");
    const pinInput = page.getByLabel("PIN code");
    await pinInput.fill(fixture.pincode);
    await expect(pinInput).toHaveValue(fixture.pincode);

    const serviceabilityResponsePromise = page.waitForResponse(
      (response) =>
        response.url() === `${backendUrl}/serviceability/${fixture.pincode}` &&
        response.request().method() === "GET",
    );
    await page.getByRole("button", { name: "Check" }).click();
    expect((await serviceabilityResponsePromise).status()).toBe(200);
    await expect(
      page.getByText(`Delivery is available in ${fixture.city}`),
    ).toBeVisible();

    await page.getByRole("button", { name: "Continue to review" }).click();
    const prepaidOption = page.getByRole("button", { name: /Pay online/ });
    await expect(prepaidOption).toBeEnabled();
    await prepaidOption.click();
    await expect(
      page.getByText("Development mode: payment will be simulated locally."),
    ).toHaveCount(0);
    await page.waitForFunction(() => typeof window.Razorpay === "function");

    const checkoutResponsePromise = page.waitForResponse(
      (response) =>
        response.url() === `${backendUrl}/checkout/session` &&
        response.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Pay securely with Razorpay" })
      .click();
    const checkoutResponse = await checkoutResponsePromise;
    expect(checkoutResponse.status()).toBe(201);
    const checkout = (await checkoutResponse.json()) as {
      orderId: string;
      amount: number;
      currency: string;
      paymentMethod: string;
      razorpay: { orderId: string; keyId: string };
      guestAccessToken: string;
      reservationExpiresAt: string;
    };
    expect(checkout).toMatchObject({
      amount: fixture.expectedTotal,
      currency: "INR",
      paymentMethod: "PREPAID",
      razorpay: { keyId: razorpayKeyId },
    });
    expect(checkout.razorpay.orderId).toMatch(/^order_e2e_[a-f0-9]{24}$/);
    expect(checkout.guestAccessToken).toHaveLength(64);
    expect(new Date(checkout.reservationExpiresAt).getTime()).toBeGreaterThan(
      Date.now(),
    );

    await expect
      .poll(() =>
        page.evaluate(() => {
          const state = (
            window as typeof window & {
              __e2eRazorpay?: {
                opened: boolean;
                options: {
                  key: string;
                  amount: number;
                  currency: string;
                  order_id: string;
                  prefill: { name: string; contact: string; email: string };
                } | null;
              };
            }
          ).__e2eRazorpay;
          return state
            ? { opened: state.opened, options: state.options }
            : { opened: false, options: null };
        }),
      )
      .toMatchObject({
        opened: true,
        options: {
          key: razorpayKeyId,
          amount: fixture.expectedTotal,
          currency: "INR",
          order_id: checkout.razorpay.orderId,
          prefill: {
            name: "Phase 13C Prepaid Guest",
            contact: "9999999999",
            email: fixture.email,
          },
        },
      });
    await expect(page).toHaveURL(/\/checkout$/);
    expect(
      await page.evaluate((orderId) =>
        sessionStorage.getItem(`guest-order:${orderId}`),
        checkout.orderId,
      ),
    ).toBe(checkout.guestAccessToken);

    const pendingOrder = await getGuestOrder(
      context.request,
      checkout.orderId,
      checkout.guestAccessToken,
    );
    expect(pendingOrder).toMatchObject({
      status: "PENDING",
      paymentMethod: "PREPAID",
      payment: {
        provider: "razorpay",
        providerOrderId: checkout.razorpay.orderId,
        providerPaymentId: null,
        status: "CREATED",
      },
    });

    const providerPaymentId = `pay_e2e_${runId.replaceAll("-", "")}`;
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
    const webhookResponse = await context.request.post(
      `${backendUrl}/webhooks/razorpay`,
      {
        data: rawWebhook,
        headers: {
          "Content-Type": "application/json",
          "X-Razorpay-Signature": signature,
        },
      },
    );
    expect(webhookResponse.status()).toBe(200);
    await expect(webhookResponse.json()).resolves.toEqual({ received: true });

    await expect
      .poll(
        async () => {
          const order = await getGuestOrder(
            context.request,
            checkout.orderId,
            checkout.guestAccessToken,
          );
          return {
            status: order.status,
            paymentStatus: order.payment?.status,
            providerPaymentId: order.payment?.providerPaymentId,
            paidTransitions: order.history.filter(
              (entry) => entry.toStatus === "PAID",
            ).length,
          };
        },
        { timeout: 15_000 },
      )
      .toEqual({
        status: "PAID",
        paymentStatus: "CAPTURED",
        providerPaymentId,
        paidTransitions: 1,
      });

    const replayResponse = await context.request.post(
      `${backendUrl}/webhooks/razorpay`,
      {
        data: rawWebhook,
        headers: {
          "Content-Type": "application/json",
          "X-Razorpay-Signature": signature,
        },
      },
    );
    expect(replayResponse.status()).toBe(200);
    await expect(replayResponse.json()).resolves.toEqual({ deduped: true });

    await page.evaluate(() => {
      const state = (
        window as typeof window & {
          __e2eRazorpay?: {
            options: { handler: (response: object) => void } | null;
          };
        }
      ).__e2eRazorpay;
      if (!state?.options) throw new Error("Razorpay checkout was not opened");
      state.options.handler({});
    });
    await expect(page).toHaveURL(
      new RegExp(`/checkout/success\\?orderId=${checkout.orderId}$`),
    );
    await expect(
      page.getByRole("heading", { name: "Thank you for your order" }),
    ).toBeVisible();
    await expect(page.getByText("Order confirmed")).toBeVisible();
    await expect(page.getByText("PAID", { exact: true })).toBeVisible();
    await expect(page.getByText("Paid online")).toBeVisible();
    await expect(page.getByText(`Contact: ${fixture.email}`)).toBeVisible();

    const cartResponse = await context.request.get(`${backendUrl}/cart`);
    expect(cartResponse.status()).toBe(200);
    await expect(cartResponse.json()).resolves.toMatchObject({
      count: 0,
      items: [],
      bundles: [],
    });
  } finally {
    await cleanupCheckoutFixture("prepaid", runId, cartSid);
  }
});

async function getGuestOrder(
  request: import("@playwright/test").APIRequestContext,
  orderId: string,
  guestAccessToken: string,
) {
  const response = await request.get(`${backendUrl}/orders/${orderId}`, {
    headers: { "X-Guest-Order-Token": guestAccessToken },
  });
  expect(response.status()).toBe(200);
  return ((await response.json()) as {
    order: {
      status: string;
      paymentMethod: string;
      payment: {
        provider: string;
        providerOrderId: string;
        providerPaymentId: string | null;
        status: string;
      } | null;
      history: Array<{ toStatus: string }>;
    };
  }).order;
}
