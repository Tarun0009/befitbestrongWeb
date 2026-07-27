import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
import {
  cleanupCheckoutFixture,
  setupCheckoutFixture,
  type CheckoutFixture,
} from "../checkout/support/checkoutFixture";

const backendUrl = process.env.E2E_BACKEND_URL ?? "http://localhost:4000";
const firebaseProjectId =
  process.env.E2E_FIREBASE_PROJECT_ID ?? "demo-befitbestrong-e2e";
const firebaseAuthEmulatorUrl =
  process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL ??
  "http://127.0.0.1:9099";
const firebaseApiKey =
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "e2e-api-key";

test("customer signup merges the guest cart and supports checkout and password recovery", async ({
  context,
  page,
}) => {
  test.slow();
  const runId = randomUUID();
  const originalPassword = "Phase1-test-password";
  const recoveredPassword = "Phase1-recovered-password";
  let fixture: CheckoutFixture | undefined;
  let cartSid: string | undefined;

  try {
    fixture = await setupCheckoutFixture("cod", runId);

    const addResponse = await context.request.post(`${backendUrl}/cart/items`, {
      data: { variantId: fixture.variantId, quantity: 1 },
    });
    expect(addResponse.status()).toBe(201);
    cartSid = (await context.cookies(backendUrl)).find(
      (cookie) => cookie.name === "cart_sid",
    )?.value;
    expect(cartSid).toBeTruthy();

    await page.goto("/signup");
    await page.getByLabel("Name").fill("Phase One Customer");
    await page.getByLabel("Email").fill(fixture.email);
    await page.getByLabel("Password", { exact: true }).fill(originalPassword);

    const sessionResponsePromise = page.waitForResponse(
      (response) =>
        response.url() === `${backendUrl}/auth/session` &&
        response.request().method() === "POST",
    );
    const mergeResponsePromise = page.waitForResponse(
      (response) =>
        response.url() === `${backendUrl}/cart/merge` &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Create account" }).click();

    const [sessionResponse, mergeResponse] = await Promise.all([
      sessionResponsePromise,
      mergeResponsePromise,
    ]);
    expect(sessionResponse.status()).toBe(200);
    expect(mergeResponse.status()).toBe(200);
    await expect(mergeResponse.json()).resolves.toMatchObject({
      cart: {
        count: 1,
        items: [{ variantId: fixture.variantId, quantity: 1 }],
      },
      summary: {
        addedLines: 1,
        bumpedLines: 0,
        cappedLines: 0,
        droppedLines: 0,
      },
    });

    await expect(page).toHaveURL(/\/account$/);
    await expect(
      page.getByRole("heading", { name: /Welcome back, Phase\./ }),
    ).toBeVisible();

    const cartButton = page.getByRole("button", { name: "Cart (1 items)" });
    await expect(cartButton).toBeVisible();
    await cartButton.click();
    const cartDialog = page.getByRole("dialog", { name: "Your cart" });
    await expect(cartDialog.getByText(fixture.productName)).toBeVisible();
    await cartDialog.getByRole("link", { name: "Checkout" }).click();

    await expect(
      page.getByRole("heading", { name: "Complete your order" }),
    ).toBeVisible();
    await expect(page.getByLabel("Email")).toHaveValue(fixture.email);
    await expect(page.getByLabel("Email")).toHaveAttribute("readonly", "");
    await page.getByLabel("Full name").fill("Phase One Customer");
    await page.getByLabel("Phone").fill("9999999999");
    await page.getByLabel("Address line 1").fill("Sector 18 test address");
    await page.getByLabel("PIN code").fill(fixture.pincode);

    const serviceabilityResponsePromise = page.waitForResponse(
      (response) =>
        response.url() ===
          `${backendUrl}/serviceability/${fixture?.pincode}` &&
        response.request().method() === "GET",
    );
    await page.getByRole("button", { name: "Check" }).click();
    expect((await serviceabilityResponsePromise).status()).toBe(200);
    await expect(
      page.getByText(`Delivery is available across India · ${fixture.city}`),
    ).toBeVisible();

    await page.getByRole("button", { name: "Continue to review" }).click();
    await page.getByRole("button", { name: /Cash on delivery/ }).click();
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
      guestAccessToken: string | null;
      paymentMethod: string;
    };
    expect(checkout).toMatchObject({
      guestAccessToken: null,
      paymentMethod: "COD",
    });

    await expect(page).toHaveURL(
      new RegExp(`/checkout/success\\?orderId=${checkout.orderId}$`),
    );
    await expect(
      page.getByRole("heading", { name: "Thank you for your order" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "View order details" }),
    ).toBeVisible();

    await page.goto("/account/orders");
    await expect(
      page.getByRole("heading", { name: "Your orders" }),
    ).toBeVisible();
    await expect(page.getByText(fixture.productName)).toBeVisible();
    await expect(page.getByText("CONFIRMED", { exact: true })).toBeVisible();

    await page.getByText(fixture.productName).click();
    await expect(page).toHaveURL(
      new RegExp(`/account/orders/${checkout.orderId}$`),
    );
    await page.getByRole("button", { name: "Cancel order" }).click();
    await page
      .getByLabel("Reason (optional)")
      .fill("Customer changed their mind before fulfillment");
    const cancellationResponsePromise = page.waitForResponse(
      (response) =>
        response.url() === `${backendUrl}/orders/${checkout.orderId}/cancel` &&
        response.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Confirm cancellation" })
      .click();
    const cancellationResponse = await cancellationResponsePromise;
    expect(cancellationResponse.status()).toBe(200);
    await expect(cancellationResponse.json()).resolves.toMatchObject({
      order: { id: checkout.orderId, status: "CANCELLED" },
    });
    await expect(
      page.locator("header").getByText("CANCELLED", { exact: true }),
    ).toBeVisible();

    const logoutButton = page.getByRole("button", { name: "Log out" });
    if (!(await logoutButton.isVisible())) {
      await page.getByRole("button", { name: "Open menu" }).click();
    }
    const logoutResponsePromise = page.waitForResponse(
      (response) =>
        response.url() === `${backendUrl}/auth/logout` &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Log out" }).click();
    expect((await logoutResponsePromise).status()).toBe(204);
    await expect(page).toHaveURL(/\/$/);

    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(fixture.email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(
      page.getByRole("heading", { name: "Check your inbox" }),
    ).toBeVisible();

    await completeLatestPasswordReset(
      context.request,
      fixture.email,
      recoveredPassword,
    );

    await page.goto("/login");
    await page.getByLabel("Email").fill(fixture.email);
    await page.getByLabel("Password", { exact: true }).fill(recoveredPassword);
    const reloginSessionPromise = page.waitForResponse(
      (response) =>
        response.url() === `${backendUrl}/auth/session` &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Log in" }).click();
    expect((await reloginSessionPromise).status()).toBe(200);
    await expect(page).toHaveURL(/\/account$/);

    await page.goto("/account/orders");
    await expect(page.getByText(fixture.productName)).toBeVisible();
  } finally {
    await cleanupCheckoutFixture("cod", runId, cartSid);
  }
});

async function completeLatestPasswordReset(
  request: APIRequestContext,
  email: string,
  newPassword: string,
) {
  const codesResponse = await request.get(
    `${firebaseAuthEmulatorUrl}/emulator/v1/projects/${firebaseProjectId}/oobCodes`,
  );
  expect(codesResponse.status()).toBe(200);
  const payload = (await codesResponse.json()) as {
    oobCodes?: Array<{
      email?: string;
      oobCode?: string;
      requestType?: string;
    }>;
  };
  const code = payload.oobCodes
    ?.filter(
      (candidate) =>
        candidate.email === email &&
        candidate.requestType === "PASSWORD_RESET" &&
        candidate.oobCode,
    )
    .at(-1)?.oobCode;
  expect(code, `No password-reset code was emitted for ${email}`).toBeTruthy();

  const resetResponse = await request.post(
    `${firebaseAuthEmulatorUrl}/identitytoolkit.googleapis.com/v1/accounts:resetPassword?key=${firebaseApiKey}`,
    { data: { oobCode: code, newPassword } },
  );
  expect(resetResponse.status()).toBe(200);
  await expect(resetResponse.json()).resolves.toMatchObject({ email });
}
