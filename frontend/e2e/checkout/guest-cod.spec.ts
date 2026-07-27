import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  cleanupCheckoutFixture,
  setupCheckoutFixture,
  type CheckoutFixture,
} from "./support/checkoutFixture";

const backendUrl = process.env.E2E_BACKEND_URL ?? "http://localhost:4000";

test("guest can place and securely reopen a cash on delivery order", async ({
  context,
  page,
}) => {
  test.slow();
  const runId = randomUUID();
  let fixture: CheckoutFixture | undefined;
  let cartSid: string | undefined;

  try {
    fixture = await setupCheckoutFixture("cod", runId);
    const addResponse = await context.request.post(`${backendUrl}/cart/items`, {
      data: { variantId: fixture.variantId, quantity: 1 },
    });
    expect(addResponse.status()).toBe(201);
    await expect(addResponse.json()).resolves.toMatchObject({
      effective: 1,
      cart: {
        count: 1,
        subtotal: fixture.expectedTotal,
        items: [{ variantId: fixture.variantId, quantity: 1 }],
      },
    });

    cartSid = (await context.cookies(backendUrl)).find(
      (cookie) => cookie.name === "cart_sid",
    )?.value;
    expect(cartSid).toBeTruthy();

    await page.goto("/checkout");
    await expect(
      page.getByRole("heading", { name: "Complete your order" }),
    ).toBeVisible();
    await expect(page.getByText("Checking out as a guest")).toBeVisible();
    await expect(
      page.getByRole("main").getByText(fixture.productName),
    ).toBeVisible();

    const emailInput = page.getByLabel("Email");
    const fullNameInput = page.getByLabel("Full name");
    const phoneInput = page.getByLabel("Phone");
    const addressInput = page.getByLabel("Address line 1");
    const pinInput = page.getByLabel("PIN code");
    await emailInput.fill(fixture.email);
    await fullNameInput.fill("Phase 13C Guest");
    await phoneInput.fill("9999999999");
    await addressInput.fill("Sector 18 test address");
    await pinInput.fill(fixture.pincode);
    await expect(emailInput).toHaveValue(fixture.email);
    await expect(fullNameInput).toHaveValue("Phase 13C Guest");
    await expect(phoneInput).toHaveValue("9999999999");
    await expect(addressInput).toHaveValue("Sector 18 test address");
    await expect(pinInput).toHaveValue(fixture.pincode);

    const serviceabilityPincode = fixture.pincode;
    const serviceabilityResponsePromise = page.waitForResponse(
      (response) =>
        response.url() === `${backendUrl}/serviceability/${serviceabilityPincode}` &&
        response.request().method() === "GET",
    );
    const checkButton = page.getByRole("button", { name: "Check" });
    await expect(checkButton).toBeEnabled();
    await checkButton.click();
    const serviceabilityResponse = await serviceabilityResponsePromise;
    expect(serviceabilityResponse.status()).toBe(200);
    await expect(serviceabilityResponse.json()).resolves.toMatchObject({
      serviceable: true,
      pincode: fixture.pincode,
      city: fixture.city,
      codEnabled: true,
    });

    await expect(
      page.getByText(`Delivery is available across India · ${fixture.city}`),
    ).toBeVisible();
    await expect(page.getByText(/COD available/)).toBeVisible();
    await expect(page.getByLabel("City")).toHaveValue(fixture.city);
    await expect(page.getByLabel("State")).toHaveValue("Uttar Pradesh");

    await page.getByRole("button", { name: "Continue to review" }).click();
    const codOption = page.getByRole("button", {
      name: /Cash on delivery/,
    });
    await expect(codOption).toBeEnabled();
    await codOption.click();

    const checkoutResponsePromise = page.waitForResponse(
      (response) =>
        response.url() === `${backendUrl}/checkout/session` &&
        response.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Place cash on delivery order" })
      .click();
    const checkoutResponse = await checkoutResponsePromise;
    expect(checkoutResponse.status()).toBe(201);
    const checkout = (await checkoutResponse.json()) as {
      orderId: string;
      amount: number;
      paymentMethod: string;
      razorpay: unknown;
      guestAccessToken: string;
      reservationExpiresAt: string | null;
    };
    expect(checkout).toMatchObject({
      amount: fixture.expectedTotal,
      paymentMethod: "COD",
      razorpay: null,
      reservationExpiresAt: null,
    });
    expect(checkout.guestAccessToken).toHaveLength(64);

    await expect(page).toHaveURL(
      new RegExp(`/checkout/success\\?orderId=${checkout.orderId}$`),
    );
    await expect(
      page.getByRole("heading", { name: "Thank you for your order" }),
    ).toBeVisible();
    await expect(page.getByText("COD order confirmed")).toBeVisible();
    await expect(page.getByText("Cash on delivery")).toBeVisible();
    await expect(page.getByText("CONFIRMED", { exact: true })).toBeVisible();
    await expect(page.getByText(`Contact: ${fixture.email}`)).toBeVisible();

    const storedToken = await page.evaluate(
      (orderId) => sessionStorage.getItem(`guest-order:${orderId}`),
      checkout.orderId,
    );
    expect(storedToken).toBe(checkout.guestAccessToken);

    const orderResponse = await context.request.get(
      `${backendUrl}/orders/${checkout.orderId}`,
      { headers: { "X-Guest-Order-Token": checkout.guestAccessToken } },
    );
    expect(orderResponse.status()).toBe(200);
    await expect(orderResponse.json()).resolves.toMatchObject({
      order: {
        id: checkout.orderId,
        userId: null,
        contactEmail: fixture.email,
        status: "CONFIRMED",
        paymentMethod: "COD",
        total: fixture.expectedTotal,
      },
    });

    const cartResponse = await context.request.get(`${backendUrl}/cart`);
    expect(cartResponse.status()).toBe(200);
    await expect(cartResponse.json()).resolves.toMatchObject({
      count: 0,
      items: [],
      bundles: [],
    });
  } finally {
    await cleanupCheckoutFixture("cod", runId, cartSid);
  }
});
