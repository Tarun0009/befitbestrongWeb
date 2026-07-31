import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  cleanupCheckoutFixture,
  setupCheckoutFixture,
  type CheckoutFixture,
} from "./support/checkoutFixture";

const backendUrl = process.env.E2E_BACKEND_URL ?? "http://localhost:4000";

test("cash on delivery is hidden and rejected at the checkout API", async ({
  context,
  page,
}) => {
  const runId = randomUUID();
  let fixture: CheckoutFixture | undefined;
  let cartSid: string | undefined;

  try {
    fixture = await setupCheckoutFixture("prepaid", runId);
    const addResponse = await context.request.post(`${backendUrl}/cart/items`, {
      data: { variantId: fixture.variantId, quantity: 1 },
    });
    expect(addResponse.status()).toBe(201);
    cartSid = (await context.cookies(backendUrl)).find(
      (cookie) => cookie.name === "cart_sid",
    )?.value;

    const serviceability = await context.request.get(
      `${backendUrl}/serviceability/${fixture.pincode}`,
    );
    expect(serviceability.status()).toBe(200);
    await expect(serviceability.json()).resolves.toMatchObject({
      serviceable: true,
      prepaidEnabled: true,
      codEnabled: false,
    });

    const rejected = await context.request.post(
      `${backendUrl}/checkout/session`,
      {
        headers: {
          "Idempotency-Key": randomUUID().replaceAll("-", "").repeat(2),
        },
        data: {
          email: fixture.email,
          paymentMethod: "COD",
          address: {
            fullName: "Prepaid Only Customer",
            phone: "9999999999",
            line1: "Checkout API test address",
            city: fixture.city,
            state: "Uttar Pradesh",
            pincode: fixture.pincode,
            country: "IN",
          },
        },
      },
    );
    expect(rejected.status()).toBe(400);
    await expect(rejected.json()).resolves.toMatchObject({
      error: { code: "validation_error" },
    });

    await page.goto("/checkout");
    await expect(
      page.getByRole("heading", { name: "Complete your order" }),
    ).toBeVisible();
    await expect(page.getByText(/Cash on delivery/i)).toHaveCount(0);
  } finally {
    await cleanupCheckoutFixture("prepaid", runId, cartSid);
  }
});
