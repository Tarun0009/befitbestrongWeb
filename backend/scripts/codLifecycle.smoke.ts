import assert from "node:assert/strict";
import { prisma } from "../src/config/db.js";
import { redis } from "../src/config/redis.js";
import {
  addItem,
  clearCart,
  getCart,
  type CartOwner,
} from "../src/modules/cart/cart.service.js";
import { createCheckoutSession } from "../src/modules/checkout/checkout.service.js";
import { transition } from "../src/modules/orders/stateMachine.js";

const suffix = Date.now().toString(36);
const owner: CartOwner = { type: "guest", id: "cod-smoke-" + suffix };
let categoryId: string | null = null;
let productId: string | null = null;
let orderId: string | null = null;

try {
  const category = await prisma.category.create({
    data: { name: "COD Smoke " + suffix, slug: "cod-smoke-" + suffix },
  });
  categoryId = category.id;
  const product = await prisma.product.create({
    data: {
      name: "COD Smoke Product " + suffix,
      slug: "cod-smoke-product-" + suffix,
      description: "Temporary COD lifecycle fixture",
      categoryId: category.id,
      basePrice: 100_000,
      variants: {
        create: {
          sku: "COD-" + suffix,
          price: 100_000,
          stock: 5,
        },
      },
    },
    include: { variants: true },
  });
  productId = product.id;
  const variant = product.variants[0]!;
  await addItem(owner, variant.id, 1);

  const checkout = await createCheckoutSession({
    userId: null,
    contactEmail: "cod-smoke@example.test",
    paymentMethod: "COD",
    cartOwner: owner,
    address: {
      fullName: "COD Smoke",
      phone: "9999999999",
      line1: "Sector 18",
      city: "Noida",
      state: "Uttar Pradesh",
      pincode: "201301",
      country: "IN",
    },
  });
  orderId = checkout.orderId;
  assert.equal(checkout.paymentMethod, "COD");
  assert.equal(checkout.razorpay, null);
  assert.equal(checkout.amount, 100_000);

  const created = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: {
      payment: true,
      history: { orderBy: { createdAt: "asc" } },
      adminNotifications: true,
    },
  });
  assert.equal(created.status, "CONFIRMED");
  assert.equal(created.paymentMethod, "COD");
  assert.equal(created.payment?.provider, "cod");
  assert.equal(created.payment?.status, "CREATED");
  assert.deepEqual(
    created.history.map((entry) => entry.toStatus),
    ["CONFIRMED"],
  );
  assert.equal(created.adminNotifications.length, 1);
  assert.equal(created.adminNotifications[0]?.type, "ORDER_COD_PLACED");
  assert.equal((await getCart(owner)).count, 0);

  await transition(prisma, orderId, "SHIPPED", {
    actor: { kind: "admin", userId: "smoke", note: "COD smoke shipment" },
  });
  await transition(prisma, orderId, "DELIVERED", {
    actor: { kind: "admin", userId: "smoke", note: "COD smoke delivery" },
  });

  const delivered = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: {
      payment: true,
      history: { orderBy: { createdAt: "asc" } },
      adminNotifications: true,
    },
  });
  assert.equal(delivered.status, "DELIVERED");
  assert.equal(delivered.payment?.status, "CAPTURED");
  assert.deepEqual(
    delivered.history.map((entry) => entry.toStatus),
    ["CONFIRMED", "SHIPPED", "DELIVERED"],
  );
  assert.equal(delivered.adminNotifications.length, 1);

  console.log(
    JSON.stringify({
      ok: true,
      orderStatus: delivered.status,
      paymentStatus: delivered.payment?.status,
      notificationType: delivered.adminNotifications[0]?.type,
      history: delivered.history.map((entry) => entry.toStatus),
    }),
  );
} finally {
  await clearCart(owner);
  if (orderId) await prisma.order.deleteMany({ where: { id: orderId } });
  if (productId) await prisma.product.deleteMany({ where: { id: productId } });
  if (categoryId) await prisma.category.deleteMany({ where: { id: categoryId } });
  await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
}

