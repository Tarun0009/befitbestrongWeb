import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

const backendUrl = process.env.E2E_BACKEND_URL ?? "http://localhost:4000";

async function blockExternalImages(page: Page) {
  await page.route("https://images.unsplash.com/**", (route) => route.abort());
}

async function assertWcag(page: Page, testInfo: TestInfo) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  await testInfo.attach("axe-results", {
    body: JSON.stringify(result, null, 2),
    contentType: "application/json",
  });
  expect(
    result.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.map((node) => node.target),
    })),
  ).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await blockExternalImages(page);
});

test("compiled services expose a ready public catalog", async ({ request }) => {
  const readiness = await request.get(`${backendUrl}/health/ready`);
  expect(readiness.status()).toBe(200);
  await expect(readiness.json()).resolves.toMatchObject({
    status: "ok",
    checks: { database: "up", redis: "up", configuration: "ready" },
  });

  const products = await request.get(`${backendUrl}/products?limit=2`);
  expect(products.status()).toBe(200);
  const catalog = (await products.json()) as { items: unknown[]; total: number };
  expect(catalog.total).toBeGreaterThan(0);
  expect(catalog.items).toHaveLength(2);
});

test("customer can move from the homepage into the seeded catalog", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/beFitBeStrong/i);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const catalogLink = page
    .getByRole("main")
    .getByRole("link", { name: "All products" });
  await expect(catalogLink).toBeVisible();

  await catalogLink.click();
  await expect(page).toHaveURL(/\/shop$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Everything you need to train." }),
  ).toBeVisible();
  const results = page.getByRole("region", { name: "Latest products" });
  await expect(results).toBeVisible();
  await expect(results.locator("article").first()).toBeVisible();

  await page.getByRole("button", { name: /Supplements/ }).click();
  await expect(page).toHaveURL(/category=supplements/);
  await expect(page.locator("article").first()).toBeVisible();
});

test("unauthenticated admin access is redirected and the API stays protected", async ({
  page,
  request,
}) => {
  const response = await request.get(`${backendUrl}/admin/email-outbox`);
  expect(response.status()).toBe(401);
  await expect(response.json()).resolves.toMatchObject({
    error: { code: "unauthenticated" },
  });

  await page.goto("/admin/email-delivery");
  await expect(page).toHaveURL(
    /\/login\?next=%2Fadmin%2Femail-delivery$/,
  );
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
});

test("homepage has no automatically detectable WCAG A or AA violations", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await assertWcag(page, testInfo);
});

test("login has no automatically detectable WCAG A or AA violations", async ({
  page,
}, testInfo) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await assertWcag(page, testInfo);
});
