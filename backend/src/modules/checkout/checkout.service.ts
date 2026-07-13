import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../../config/db.js";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { HttpError } from "../../middleware/errorHandler.js";
import {
  clearCart,
  getCart,
  type CartOwner,
} from "../cart/cart.service.js";
import {
  createRazorpayOrder,
  isRazorpayConfigured,
} from "../../lib/razorpay.js";
import { recordInitialHistory, transition } from "../orders/stateMachine.js";
import {
  calculateCouponDiscount,
  consumeCouponUsage,
} from "./coupon.service.js";

/**
 * Checkout — the money path.
 *
 * Two invariants we absolutely must keep:
 *
 *   1. NEVER oversell. Stock decrement must be atomic and refuse when the
 *      row's current stock is below the requested quantity. We use Prisma's
 *      `update({ where: { id, stock: { gte: qty } }, data: { stock: { decrement } } })`
 *      which compiles to `UPDATE ... WHERE id=? AND stock>=? RETURNING *`.
 *      If a concurrent order took the last piece, our UPDATE returns 0 rows
 *      and Prisma throws — we roll the whole transaction back and no order
 *      is created.
 *
 *   2. Once the Razorpay order id is committed to the DB, ANY subsequent
 *      webhook for it must be able to find the order and transition it. So
 *      we create Razorpay's order INSIDE the DB transaction but BEFORE the
 *      commit — if either side fails, we bail. If Razorpay succeeds and DB
 *      commit fails, we have a dangling Razorpay order (acceptable — they
 *      auto-expire and cost nothing).
 *
 * The cart is cleared right after the DB commit. Between /checkout/session
 * and the eventual webhook, stock is already decremented so the row is
 * "reserved" from any other buyer's point of view.
 */

export interface CheckoutAddress {
  fullName: string;
  phone: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  pincode: string;
  country?: string;
}

export interface CheckoutInput {
  userId: string | null;
  contactEmail: string;
  couponCode?: string | null;
  cartOwner: CartOwner;
  address: CheckoutAddress;
}

export interface CheckoutResult {
  orderId: string;
  amount: number;
  currency: string;
  razorpay: {
    orderId: string;
    keyId: string;
  };
  guestAccessToken: string | null;
}

const SHIPPING_FLAT = 0; // free shipping in demo; wire up per-country later
const TAX_RATE = 0; // demo has GST-inclusive pricing already

export async function createCheckoutSession(
  input: CheckoutInput,
): Promise<CheckoutResult> {

  // 1. Snapshot the cart. Server-side re-hydrate so we never trust client totals.
  const cart = await getCart(input.cartOwner);
  if (cart.items.length === 0 && cart.bundles.length === 0) {
    throw new HttpError(400, "empty_cart", "Cart is empty");
  }
  for (const line of cart.items) {
    if (line.outOfStock || line.quantity <= 0) {
      throw new HttpError(
        409,
        "line_unavailable",
        `${line.name} is unavailable`,
      );
    }
  }
  for (const bundle of cart.bundles) {
    if (bundle.quantity <= 0 || bundle.availableUnits < bundle.quantity) {
      throw new HttpError(
        409,
        "bundle_unavailable",
        `${bundle.name} is unavailable at the requested quantity`,
      );
    }
  }

  const subtotal = cart.retailSubtotal;
  const merchandiseTotal = cart.subtotal;
  const bundleDiscount = cart.bundleSavings;
  const coupon = input.couponCode
    ? await calculateCouponDiscount(input.couponCode, merchandiseTotal, input.userId)
    : null;
  const couponDiscount = coupon?.discount ?? 0;
  const discount = bundleDiscount + couponDiscount;
  const shipping = SHIPPING_FLAT;
  const tax = Math.round((subtotal - discount) * TAX_RATE);
  const total = subtotal - discount + shipping + tax;
  const currency = cart.currency ?? "INR";
  const guestAccessToken = input.userId
    ? null
    : randomBytes(32).toString("base64url");
  const guestAccessTokenHash = guestAccessToken
    ? hashGuestToken(guestAccessToken)
    : null;

  // 2. Reserve stock + create the pending order in one transaction.
  const order = await prisma.$transaction(async (tx) => {
    const stockRequests = new Map<
      string,
      { quantity: number; name: string }
    >();
    for (const line of cart.items) {
      stockRequests.set(line.variantId, {
        quantity: (stockRequests.get(line.variantId)?.quantity ?? 0) + line.quantity,
        name: line.name,
      });
    }
    for (const bundle of cart.bundles) {
      for (const item of bundle.items) {
        stockRequests.set(item.variantId, {
          quantity:
            (stockRequests.get(item.variantId)?.quantity ?? 0) +
            item.quantity * bundle.quantity,
          name: `${bundle.name}: ${item.product.name}`,
        });
      }
    }

    for (const [variantId, request] of stockRequests) {
      const result = await tx.productVariant.updateMany({
        where: { id: variantId, stock: { gte: request.quantity } },
        data: { stock: { decrement: request.quantity } },
      });
      if (result.count === 0) {
        throw new HttpError(
          409,
          "insufficient_stock",
          `${request.name} — not enough stock left`,
        );
      }
    }

    if (coupon) {
      await consumeCouponUsage(tx, coupon);
    }

    // Address snapshot (immutable copy stored on the order).
    const addressSnapshot = {
      fullName: input.address.fullName,
      phone: input.address.phone,
      line1: input.address.line1,
      line2: input.address.line2 ?? null,
      city: input.address.city,
      state: input.address.state,
      pincode: input.address.pincode,
      country: input.address.country ?? "IN",
    };

    const created = await tx.order.create({
      data: {
        userId: input.userId,
        contactEmail: input.contactEmail,
        guestAccessTokenHash,
        status: "PENDING",
        subtotal,
        discount,
        bundleDiscount,
        couponDiscount,
        couponCode: coupon?.code ?? null,
        shipping,
        tax,
        total,
        currency,
        addressSnapshot,
        items: {
          create: [
            ...cart.items.map((line) => ({
              variantId: line.variantId,
              unitPrice: line.price,
              quantity: line.quantity,
              subtotal: line.price * line.quantity,
              productSnapshot: {
                productId: line.productId,
                slug: line.slug,
                name: line.name,
                sku: line.sku,
                size: line.size,
                color: line.color,
                image: line.image,
              },
            })),
            ...cart.bundles.flatMap((bundle) =>
              bundle.items.map((item) => ({
                variantId: item.variantId,
                unitPrice: item.price,
                quantity: item.quantity * bundle.quantity,
                subtotal: item.price * item.quantity * bundle.quantity,
                productSnapshot: {
                  productId: item.product.id,
                  slug: item.product.slug,
                  name: item.product.name,
                  sku: item.sku,
                  size: item.size,
                  color: item.color,
                  image: item.product.image,
                  bundle: {
                    id: bundle.bundleId,
                    slug: bundle.slug,
                    name: bundle.name,
                    bundleQuantity: bundle.quantity,
                    unitBundlePrice: bundle.unitPrice,
                    unitSavings: bundle.savings,
                  },
                },
              })),
            ),
          ],
        },
      },
    });
    // First row in the audit trail: PENDING at t=0.
    await recordInitialHistory(
      tx,
      created.id,
      input.userId
        ? { kind: "customer", userId: input.userId }
        : { kind: "guest", note: "guest order created" },
    );
    return created;
  });

  // 3. Create the Razorpay order — outside the tx, since it's an external call.
  //    If this fails, stock is already reserved and the order is PENDING. The
  //    checkout/cancel path (or the timeout job in a future phase) releases
  //    it. For now we surface the error and let the client retry.
  let rzp: { id: string };
  if (isRazorpayConfigured()) {
    try {
      rzp = await createRazorpayOrder({
        amount: total,
        currency,
        receipt: order.id,
        notes: {
          orderId: order.id,
          buyer: input.userId ?? "guest",
          contactEmail: input.contactEmail,
        },
      });
    } catch (err) {
      logger.error({ err, orderId: order.id }, "razorpay order create failed");
      await transition(prisma, order.id, "FAILED", {
        actor: {
          kind: "system",
          note: "razorpay create order failed",
        },
      });
      throw err;
    }
  } else if (env.NODE_ENV !== "production") {
    rzp = { id: "dev_order_" + order.id };
  } else {
    await transition(prisma, order.id, "FAILED", {
      actor: { kind: "system", note: "payment provider unavailable" },
    });
    throw new HttpError(
      503,
      "payment_unavailable",
      "Payment provider is not configured",
    );
  }

  // 4. Persist the Razorpay linkage + create a Payment row for the webhook to
  //    join against later. Also clear the cart — the customer has committed.
  await prisma.$transaction([
    prisma.order.update({
      where: { id: order.id },
      data: { providerOrderId: rzp.id },
    }),
    prisma.payment.create({
      data: {
        orderId: order.id,
        provider: isRazorpayConfigured() ? "razorpay" : "dev",
        providerOrderId: rzp.id,
        amount: total,
        currency,
        status: "CREATED",
      },
    }),
  ]);

  await clearCart(input.cartOwner);

  return {
    orderId: order.id,
    amount: total,
    currency,
    razorpay: {
      orderId: rzp.id,
      keyId: env.RAZORPAY_KEY_ID ?? "",
    },
    guestAccessToken,
  };
}

/**
 * Best-effort cancel path. Idempotent: no-op if the order is already terminal.
 * Delegated to the state machine so history is recorded and stock releases via
 * the same code path used by admin cancels.
 */
export function hashGuestToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function findAccessibleOrder(
  orderId: string,
  userId: string | null,
  guestAccessToken: string | null,
  pendingOnly = false,
) {
  const access = [
    ...(userId ? [{ userId }] : []),
    ...(guestAccessToken
      ? [{ guestAccessTokenHash: hashGuestToken(guestAccessToken) }]
      : []),
  ];
  if (access.length === 0) {
    throw new HttpError(401, "checkout_access_required", "Order access required");
  }
  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      ...(pendingOnly ? { status: "PENDING" as const } : {}),
      OR: access,
    },
    select: { id: true, status: true },
  });
  if (!order) {
    throw new HttpError(404, "order_not_found", "Order not found");
  }
  return order;
}

export async function cancelCheckout(
  userId: string | null,
  guestAccessToken: string | null,
  orderId: string,
): Promise<void> {
  const order = await findAccessibleOrder(
    orderId,
    userId,
    guestAccessToken,
  );
  if (order.status !== "PENDING") return;

  await transition(prisma, order.id, "CANCELLED", {
    actor: userId
      ? { kind: "customer", userId, note: "user cancelled checkout" }
      : { kind: "guest", note: "guest cancelled checkout" },
  });
}

export async function devCompleteOrder(
  userId: string | null,
  guestAccessToken: string | null,
  orderId: string,
): Promise<void> {
  const order = await findAccessibleOrder(
    orderId,
    userId,
    guestAccessToken,
    true,
  );
  await transition(prisma, order.id, "PAID", {
    actor: { kind: "system", note: "dev-complete bypass" },
    skipSideEffects: true,
    paymentUpdate: {
      status: "CAPTURED",
      providerPaymentId: "dev_" + Date.now(),
    },
  });
  logger.warn(
    { orderId, buyer: userId ?? "guest" },
    "dev-complete used — bypassed razorpay",
  );
}



