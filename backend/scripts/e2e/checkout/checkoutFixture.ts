import "dotenv/config";
import { randomInt } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import Redis from "ioredis";

const prisma = new PrismaClient();
const command = process.argv[2];
const flow = normalizeFlow(process.argv[3]);
const runId = normalizeRunId(process.argv[4]);
const cartSid = process.argv[5];

assertSafeEnvironment();

try {
  if (command === "setup") {
    console.log(JSON.stringify(await setupFixture(flow, runId)));
  } else if (command === "cleanup") {
    await cleanupFixture(flow, runId, cartSid);
    console.log(JSON.stringify({ ok: true, flow, runId }));
  } else {
    throw new Error(
      "Usage: checkoutFixture.ts <setup|cleanup> <cod|prepaid> <run-id> [cart-sid]",
    );
  }
} finally {
  await prisma.$disconnect();
}

function assertSafeEnvironment() {
  if (process.env.E2E_FIXTURE_MODE !== "1") {
    throw new Error("E2E_FIXTURE_MODE=1 is required");
  }
  if (
    process.env.APP_ENV === "production" ||
    process.env.NODE_ENV === "production"
  ) {
    throw new Error("E2E fixtures are forbidden in production");
  }
}

function normalizeRunId(value: string | undefined) {
  const normalized = value?.toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (!normalized || normalized.length < 8 || normalized.length > 64) {
    throw new Error("A URL-safe run id between 8 and 64 characters is required");
  }
  return normalized;
}

function normalizeFlow(value: string | undefined): "cod" | "prepaid" {
  if (value === "cod" || value === "prepaid") return value;
  throw new Error("Checkout fixture flow must be cod or prepaid");
}

function fixtureIdentity(flow: "cod" | "prepaid", id: string) {
  const label = flow === "cod" ? "COD" : "Prepaid";
  return {
    categorySlug: `e2e-${flow}-${id}`,
    productSlug: `e2e-${flow}-product-${id}`,
    contactEmail: `e2e-${flow}-${id}@example.test`,
    city: `E2E Checkout ${flow} ${id.slice(0, 8)}`,
    label,
  };
}

async function setupFixture(flow: "cod" | "prepaid", id: string) {
  await cleanupDatabaseRows(flow, id);
  const identity = fixtureIdentity(flow, id);
  const pincode = await createServiceArea(identity.city);

  try {
    const category = await prisma.category.create({
      data: {
        name: `E2E ${identity.label} ${id.slice(0, 8)}`,
        slug: identity.categorySlug,
        products: {
          create: {
            name: `E2E ${identity.label} Test Product`,
            slug: identity.productSlug,
            description: `Disposable product for the guest ${flow} browser journey`,
            basePrice: 100_000,
            variants: {
              create: {
                sku: `E2E-${flow}-${id}`.toUpperCase(),
                price: 100_000,
                stock: 2,
              },
            },
          },
        },
      },
      include: {
        products: { include: { variants: true } },
      },
    });
    const product = category.products[0];
    const variant = product?.variants[0];
    if (!product || !variant) {
      throw new Error("Checkout fixture product was not created");
    }

    await clearRedisState();

    return {
      flow,
      runId: id,
      categoryId: category.id,
      productId: product.id,
      variantId: variant.id,
      productName: product.name,
      pincode,
      city: identity.city,
      email: identity.contactEmail,
      expectedTotal: variant.price,
    };
  } catch (error) {
    await cleanupDatabaseRows(flow, id);
    throw error;
  }
}

async function createServiceArea(city: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const pincode = String(290_000 + randomInt(10_000));
    try {
      await prisma.serviceArea.create({
        data: {
          pincode,
          zone: "NOIDA",
          city,
          state: "Uttar Pradesh",
          active: true,
          prepaidEnabled: true,
          codEnabled: true,
          codMaxOrderAmount: 500_000,
          codFee: 0,
          estimatedDeliveryMinDays: 1,
          estimatedDeliveryMaxDays: 2,
        },
      });
      return pincode;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        continue;
      }
      throw error;
    }
  }
  throw new Error("Could not allocate an isolated service-area PIN");
}

async function cleanupFixture(
  flow: "cod" | "prepaid",
  id: string,
  sid?: string,
) {
  await cleanupDatabaseRows(flow, id);
  await clearRedisState(sid);
}

async function clearRedisState(sid?: string) {
  const redis = new Redis(
    process.env.REDIS_URL ?? "redis://localhost:6381",
    { lazyConnect: true, maxRetriesPerRequest: 1 },
  );
  try {
    await redis.connect();
    const catalogTagKey = "cache:tag:catalog:list";
    const catalogKeys = await redis.smembers(catalogTagKey);
    const pipeline = redis.multi();
    for (const key of catalogKeys) pipeline.del(key);
    pipeline.del(catalogTagKey);
    if (sid) {
      pipeline.del(`cart:guest:${sid}`, `cart:guest:${sid}:bundles`);
    }
    await pipeline.exec();
    await redis.quit();
  } catch (error) {
    redis.disconnect();
    throw error;
  }
}

async function cleanupDatabaseRows(flow: "cod" | "prepaid", id: string) {
  const identity = fixtureIdentity(flow, id);
  const orderIds = (
    await prisma.order.findMany({
      where: { contactEmail: identity.contactEmail },
      select: { id: true },
    })
  ).map((order) => order.id);

  if (orderIds.length > 0) {
    await prisma.$transaction([
      prisma.webhookEvent.deleteMany({
        where: {
          OR: [
            { localOrderId: { in: orderIds } },
            { eventId: { startsWith: `event_e2e_${id.replaceAll("-", "")}` } },
          ],
        },
      }),
      prisma.emailOutbox.deleteMany({
        where: { referenceType: "Order", referenceId: { in: orderIds } },
      }),
      prisma.checkoutAttempt.deleteMany({
        where: { orderId: { in: orderIds } },
      }),
      prisma.order.deleteMany({ where: { id: { in: orderIds } } }),
    ]);
  }

  await prisma.product.deleteMany({ where: { slug: identity.productSlug } });
  await prisma.category.deleteMany({ where: { slug: identity.categorySlug } });
  await prisma.serviceArea.deleteMany({ where: { city: identity.city } });

  const staleBefore = new Date(Date.now() - 6 * 60 * 60 * 1000);
  await prisma.serviceArea.deleteMany({
    where: {
      city: { startsWith: "E2E Checkout " },
      createdAt: { lt: staleBefore },
    },
  });
}
