import assert from "node:assert/strict";
import { prisma } from "../src/config/db.js";
import { redis } from "../src/config/redis.js";
import { createBundle } from "../src/modules/bundles/bundle.service.js";
import { addBundle } from "../src/modules/bundles/bundleCart.service.js";
import { clearCart, getCart, type CartOwner } from "../src/modules/cart/cart.service.js";
import {
  cancelCheckout,
  createCheckoutSession,
} from "../src/modules/checkout/checkout.service.js";

const suffix = Date.now().toString(36);
const owner: CartOwner = { type: "guest", id: "bundle-smoke-" + suffix };
let categoryId: string | null = null;
let productId: string | null = null;
let bundleId: string | null = null;
let orderId: string | null = null;

try {
  const category = await prisma.category.create({
    data: { name: "Bundle Smoke " + suffix, slug: "bundle-smoke-" + suffix },
  });
  categoryId = category.id;
  const product = await prisma.product.create({
    data: {
      name: "Bundle Smoke Product " + suffix,
      slug: "bundle-smoke-product-" + suffix,
      description: "Temporary lifecycle fixture",
      categoryId: category.id,
      basePrice: 2000,
      variants: {
        create: [
          { sku: "BUNDLE-A-" + suffix, price: 2000, stock: 5 },
          { sku: "BUNDLE-B-" + suffix, price: 3000, stock: 4 },
        ],
      },
    },
    include: { variants: true },
  });
  productId = product.id;

  const created = await createBundle({
    name: "Lifecycle Stack " + suffix,
    description: "Two-component lifecycle verification stack",
    active: true,
    pricingType: "PERCENTAGE_OFF",
    value: 20,
    items: product.variants.map((variant) => ({
      variantId: variant.id,
      quantity: 1,
    })),
  });
  bundleId = created.bundle.id;
  assert.equal(created.bundle.componentTotal, 5000);
  assert.equal(created.bundle.unitPrice, 4000);
  assert.equal(created.bundle.availableUnits, 4);

  const effective = await addBundle(owner, bundleId, 2);
  assert.equal(effective, 2);
  const cart = await getCart(owner);
  assert.equal(cart.items.length, 0);
  assert.equal(cart.bundles.length, 1);
  assert.equal(cart.count, 4);
  assert.equal(cart.retailSubtotal, 10000);
  assert.equal(cart.bundleSavings, 2000);
  assert.equal(cart.subtotal, 8000);

  const checkout = await createCheckoutSession({
    userId: null,
    contactEmail: "bundle-smoke@example.test",
    paymentMethod: "PREPAID",
    cartOwner: owner,
    address: {
      fullName: "Bundle Smoke",
      phone: "9999999999",
      line1: "Test address",
      city: "Test",
      state: "Delhi",
      pincode: "110001",
      country: "IN",
    },
  });
  orderId = checkout.orderId;
  assert.equal(checkout.amount, 8000);

  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { items: true },
  });
  assert.equal(order.subtotal, 10000);
  assert.equal(order.discount, 2000);
  assert.equal(order.bundleDiscount, 2000);
  assert.equal(order.couponDiscount, 0);
  assert.equal(order.total, 8000);
  assert.equal(order.items.length, 2);
  assert.ok(
    order.items.every((item) => {
      const snapshot = item.productSnapshot as { bundle?: { id?: string } };
      return snapshot.bundle?.id === bundleId;
    }),
  );

  const reserved = await prisma.productVariant.findMany({
    where: { productId: product.id },
    orderBy: { price: "asc" },
  });
  assert.deepEqual(reserved.map((variant) => variant.stock), [3, 2]);

  await cancelCheckout(null, checkout.guestAccessToken, orderId);
  const released = await prisma.productVariant.findMany({
    where: { productId: product.id },
    orderBy: { price: "asc" },
  });
  assert.deepEqual(released.map((variant) => variant.stock), [5, 4]);

  const empty = await getCart(owner);
  assert.equal(empty.count, 0);

  console.log(
    JSON.stringify({
      ok: true,
      bundleUnitPrice: created.bundle.unitPrice,
      bundleSavings: cart.bundleSavings,
      orderTotal: order.total,
      componentStocksReleased: released.map((variant) => variant.stock),
    }),
  );
} finally {
  await clearCart(owner);
  if (orderId) await prisma.order.deleteMany({ where: { id: orderId } });
  if (bundleId) await prisma.bundle.deleteMany({ where: { id: bundleId } });
  if (productId) await prisma.product.deleteMany({ where: { id: productId } });
  if (categoryId) await prisma.category.deleteMany({ where: { id: categoryId } });
  await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
}
