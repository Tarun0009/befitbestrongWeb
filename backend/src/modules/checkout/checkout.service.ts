import { createHash } from "node:crypto";
import type { Order, PaymentMethod } from "@prisma/client";
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
import {
  assertPaymentMethodAvailable,
  requireServiceArea,
} from "../serviceability/serviceability.service.js";
import { createOrderAdminNotification } from "../notifications/adminNotification.service.js";
import { queueOrderStatusEmail } from "../orders/orderEmail.service.js";
import { queueAdminOrderNotificationEmail } from "../notifications/adminOrderEmail.service.js";
import { checkoutRequestHash } from "./checkoutIdempotency.policy.js";
import {
  acquireCheckoutAttempt,
  markCheckoutAttemptFailed,
} from "./checkoutIdempotency.service.js";
import { reservationExpiryDeadline } from "./checkoutExpiry.policy.js";

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
 *   2. Never hold a database transaction open across a payment-provider call.
 *      We reserve stock and create the local order atomically, create the
 *      Razorpay order after commit, then persist the provider link. Provider
 *      failure transitions the local order to FAILED and releases stock.
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
  paymentMethod: PaymentMethod;
  idempotencyKey: string;
}

export interface CheckoutResult {
  orderId: string;
  amount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  paymentFee: number;
  razorpay: {
    orderId: string;
    keyId: string;
  } | null;
  guestAccessToken: string | null;
  reservationExpiresAt: string | null;
}

export interface CheckoutSessionOutcome {
  result: CheckoutResult;
  replayed: boolean;
}

type CheckoutOrder = Pick<
  Order,
  | "id"
  | "userId"
  | "contactEmail"
  | "status"
  | "paymentMethod"
  | "total"
  | "currency"
  | "paymentFee"
  | "providerOrderId"
  | "reservationExpiresAt"
>;

const SHIPPING_FLAT = 0; // free shipping in demo; wire up per-country later
const TAX_RATE = 0; // demo has GST-inclusive pricing already

export async function createCheckoutSession(
  input: CheckoutInput,
): Promise<CheckoutSessionOutcome> {
  const claim = await acquireCheckoutAttempt({
    owner: input.cartOwner,
    idempotencyKey: input.idempotencyKey,
    requestHash: checkoutRequestHash(input),
  });

  if (claim.completed) {
    return {
      result: await replayCheckoutSession(input, claim.attempt.orderId),
      replayed: true,
    };
  }

  try {
    const result = claim.attempt.orderId
      ? await resumeCheckoutSession(input, claim.attempt.id, claim.attempt.orderId)
      : await createFreshCheckoutSession(input, claim.attempt.id);
    return { result, replayed: false };
  } catch (error) {
    await markCheckoutAttemptFailed(claim.attempt.id, error).catch(
      (markError) => {
        logger.error(
          { err: markError, checkoutAttemptId: claim.attempt.id },
          "checkout attempt failure could not be persisted",
        );
      },
    );
    throw error;
  }
}

async function createFreshCheckoutSession(
  input: CheckoutInput,
  checkoutAttemptId: string,
): Promise<CheckoutResult> {
  // Coverage is authoritative and checked before any stock is reserved.
  const serviceArea = await requireServiceArea(input.address.pincode);

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
  const amountBeforeFee = subtotal - discount + shipping + tax;
  const { paymentFee, total } = assertPaymentMethodAvailable(
    serviceArea,
    input.paymentMethod,
    amountBeforeFee,
  );
  const currency = cart.currency ?? "INR";
  // The browser-generated key is high-entropy and lets a guest recover the
  // same access token after a lost response without storing that token in DB.
  const guestAccessToken = input.userId ? null : input.idempotencyKey;
  const guestAccessTokenHash = guestAccessToken
    ? hashGuestToken(guestAccessToken)
    : null;
  const reservationExpiresAt =
    input.paymentMethod === "PREPAID"
      ? reservationExpiryDeadline(
          new Date(),
          env.CHECKOUT_RESERVATION_MINUTES,
        )
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
        status: input.paymentMethod === "COD" ? "CONFIRMED" : "PENDING",
        paymentMethod: input.paymentMethod,
        subtotal,
        discount,
        bundleDiscount,
        couponDiscount,
        couponCode: coupon?.code ?? null,
        shipping,
        paymentFee,
        tax,
        total,
        currency,
        addressSnapshot,
        reservationExpiresAt,
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
    const initialStatus =
      input.paymentMethod === "COD" ? "CONFIRMED" : "PENDING";
    await recordInitialHistory(
      tx,
      created.id,
      input.userId
        ? { kind: "customer", userId: input.userId }
        : { kind: "guest", note: "guest order created" },
      initialStatus,
    );

    if (input.paymentMethod === "COD") {
      await tx.payment.create({
        data: {
          orderId: created.id,
          provider: "cod",
          providerOrderId: "cod_" + created.id,
          amount: total,
          currency,
          status: "CREATED",
        },
      });
      await createOrderAdminNotification(tx, {
        type: "ORDER_COD_PLACED",
        orderId: created.id,
        total,
        currency,
        contactEmail: input.contactEmail,
      });
      await queueOrderStatusEmail(tx, created.id, "CONFIRMED");
      await queueAdminOrderNotificationEmail(
        tx,
        created.id,
        "ORDER_COD_PLACED",
      );
    }
    await tx.checkoutAttempt.update({
      where: { id: checkoutAttemptId },
      data: {
        orderId: created.id,
        ...(input.paymentMethod === "COD"
          ? { status: "COMPLETED" as const, completedAt: new Date() }
          : {}),
      },
    });
    return created;
  });

  if (input.paymentMethod === "COD") {
    await clearCommittedCart(input.cartOwner, order.id);
    return checkoutResult(order, guestAccessToken, null);
  }

  return finalizePrepaidCheckout(
    input,
    checkoutAttemptId,
    order,
    guestAccessToken,
  );
}

async function finalizePrepaidCheckout(
  input: CheckoutInput,
  checkoutAttemptId: string,
  order: CheckoutOrder,
  guestAccessToken: string | null,
): Promise<CheckoutResult> {
  // 3. Create the Razorpay order — outside the tx, since it's an external call.
  //    If this fails, the state machine marks the order FAILED and releases
  //    stock. The attempt records the failure, so a new logical attempt must
  //    use a new key instead of accidentally creating a duplicate order.
  let rzp: { id: string };
  if (isRazorpayConfigured()) {
    try {
      rzp = await createRazorpayOrder({
        amount: order.total,
        currency: order.currency,
        receipt: order.id,
        notes: {
          orderId: order.id,
          buyer: order.userId ?? "guest",
          contactEmail: order.contactEmail,
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
    prisma.payment.upsert({
      where: { orderId: order.id },
      update: {
        provider: isRazorpayConfigured() ? "razorpay" : "dev",
        providerOrderId: rzp.id,
      },
      create: {
        orderId: order.id,
        provider: isRazorpayConfigured() ? "razorpay" : "dev",
        providerOrderId: rzp.id,
        amount: order.total,
        currency: order.currency,
        status: "CREATED",
      },
    }),
    prisma.checkoutAttempt.update({
      where: { id: checkoutAttemptId },
      data: { status: "COMPLETED", completedAt: new Date() },
    }),
  ]);

  await clearCommittedCart(input.cartOwner, order.id);

  return checkoutResult(order, guestAccessToken, rzp.id);
}

async function replayCheckoutSession(
  input: CheckoutInput,
  orderId: string | null,
): Promise<CheckoutResult> {
  if (!orderId) {
    throw new HttpError(
      500,
      "checkout_state_invalid",
      "Completed checkout has no order",
    );
  }
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) {
    throw new HttpError(
      500,
      "checkout_state_invalid",
      "Checkout order is missing",
    );
  }
  if (order.paymentMethod === "PREPAID" && order.reservationExpiredAt) {
    throw new HttpError(
      409,
      "checkout_expired",
      "This payment session expired. Start a new checkout to continue.",
    );
  }
  if (order.paymentMethod === "PREPAID" && !order.providerOrderId) {
    throw new HttpError(
      500,
      "checkout_state_invalid",
      "Checkout payment session is missing",
    );
  }
  return checkoutResult(
    order,
    input.userId ? null : input.idempotencyKey,
    order.providerOrderId,
  );
}

async function resumeCheckoutSession(
  input: CheckoutInput,
  checkoutAttemptId: string,
  orderId: string,
): Promise<CheckoutResult> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { payment: { select: { id: true } } },
  });
  if (!order) {
    throw new HttpError(
      500,
      "checkout_state_invalid",
      "Checkout order is missing",
    );
  }

  const guestAccessToken = input.userId ? null : input.idempotencyKey;
  if (order.paymentMethod === "COD") {
    await prisma.checkoutAttempt.update({
      where: { id: checkoutAttemptId },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    return checkoutResult(order, guestAccessToken, null);
  }
  if (order.providerOrderId && order.payment) {
    await prisma.checkoutAttempt.update({
      where: { id: checkoutAttemptId },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    return checkoutResult(order, guestAccessToken, order.providerOrderId);
  }
  if (order.status !== "PENDING") {
    throw new HttpError(
      409,
      "checkout_not_resumable",
      "This checkout attempt can no longer be resumed",
    );
  }
  return finalizePrepaidCheckout(
    input,
    checkoutAttemptId,
    order,
    guestAccessToken,
  );
}

function checkoutResult(
  order: CheckoutOrder,
  guestAccessToken: string | null,
  providerOrderId: string | null,
): CheckoutResult {
  return {
    orderId: order.id,
    amount: order.total,
    currency: order.currency,
    paymentMethod: order.paymentMethod,
    paymentFee: order.paymentFee,
    razorpay:
      order.paymentMethod === "PREPAID" && providerOrderId
        ? { orderId: providerOrderId, keyId: env.RAZORPAY_KEY_ID ?? "" }
        : null,
    guestAccessToken,
    reservationExpiresAt: order.reservationExpiresAt?.toISOString() ?? null,
  };
}

async function clearCommittedCart(owner: CartOwner, orderId: string) {
  try {
    await clearCart(owner);
  } catch (error) {
    logger.error({ err: error, orderId }, "committed checkout cart clear failed");
  }
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

