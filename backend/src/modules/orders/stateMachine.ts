import type { OrderStatus, Prisma, PrismaClient } from "@prisma/client";
import { HttpError } from "../../middleware/errorHandler.js";
import { logger } from "../../config/logger.js";
import { refundRazorpayPayment } from "../../lib/razorpay.js";
import { sendOrderStatusEmail } from "./orderEmail.service.js";
import { handleLoyaltyTransition } from "../loyalty/loyalty.service.js";
import { createOrderAdminNotification } from "../notifications/adminNotification.service.js";
import { sendAdminOrderNotificationEmail } from "../notifications/adminOrderEmail.service.js";

/**
 * Order state machine.
 *
 * All transitions in the system go through `transition()`. It validates the
 * move against `TRANSITIONS`, runs any side effect atomically inside the
 * same transaction as the status update, and writes an `OrderStatusHistory`
 * row — so invalid moves throw before touching state, and every legal move
 * leaves an audit trail.
 *
 * The transitions come straight from PLAN.md's diagram:
 *
 *   pending   → paid | cancelled | failed
 *   confirmed → shipped | cancelled (COD)
 *   paid      → shipped | refunded
 *   shipped   → delivered
 *   delivered → refunded
 *   failed / cancelled / refunded — terminal
 */

export const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING: ["PAID", "CANCELLED", "FAILED"],
  CONFIRMED: ["SHIPPED", "CANCELLED"],
  PAID: ["SHIPPED", "REFUNDED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: ["REFUNDED"],
  FAILED: [],
  CANCELLED: [],
  REFUNDED: [],
} as const;

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export type Actor =
  | { kind: "system"; note?: string }
  | { kind: "guest"; note?: string }
  | { kind: "customer"; userId: string; note?: string }
  | { kind: "admin"; userId: string; note?: string };

/**
 * Anything that runs inside `prisma.$transaction(fn)`: either the top-level
 * PrismaClient (for callers wanting a fresh tx) or a TransactionClient (for
 * callers already inside one).
 */
export type TxOrClient = PrismaClient | Prisma.TransactionClient;

interface TransitionOpts {
  actor: Actor;
  /** Skip side effects (stock release / refund) — used by the webhook worker
   *  when Razorpay already did the payment side and we're just recording it. */
  skipSideEffects?: boolean;
  /** Extra payload merged into the transition — provider ids from webhooks etc. */
  paymentUpdate?: {
    providerPaymentId?: string;
    rawPayload?: object;
    status?: "AUTHORIZED" | "CAPTURED" | "FAILED" | "REFUNDED";
  };
}

/**
 * Run a transition. Throws on invalid moves. Wraps everything in a single
 * DB transaction so the status change, the history row, and any side effects
 * (stock release, refund side-effects, Payment row updates) commit together.
 *
 * NOTE: the Razorpay REST call for refunds happens OUTSIDE the DB tx (see
 * `applyRefund` — same pattern as the checkout flow: never hold a DB tx open
 * across a network call).
 */
export async function transition(
  db: PrismaClient,
  orderId: string,
  to: OrderStatus,
  opts: TransitionOpts,
) {
  // Load once outside the tx so we can decide about the external refund call.
  const before = await db.order.findUnique({
    where: { id: orderId },
    include: { items: true, payment: true },
  });
  if (!before) {
    throw new HttpError(404, "order_not_found", "Order not found");
  }
  if (before.status === to) {
    // Idempotent no-op — the worker may deliver the same event twice.
    return before;
  }
  if (!canTransition(before.status, to)) {
    throw new HttpError(
      409,
      "invalid_transition",
      `Cannot transition ${before.status} → ${to}`,
    );
  }

  // Side effect that needs the network — do it BEFORE the DB tx opens so we
  // don't hold locks across the call. If it fails, we bail before any writes.
  let refundRawPayload: object | undefined;
  if (
    !opts.skipSideEffects &&
    to === "REFUNDED" &&
    before.payment?.provider !== "cod" &&
    (before.status === "PAID" || before.status === "DELIVERED")
  ) {
    if (!before.payment?.providerPaymentId) {
      throw new HttpError(
        409,
        "no_payment_to_refund",
        "Order has no captured payment to refund",
      );
    }
    const rzpRefund = await refundRazorpayPayment({
      paymentId: before.payment.providerPaymentId,
      amount: before.total,
      notes: { orderId: before.id },
    });
    refundRawPayload = rzpRefund as unknown as object;
    logger.info(
      { orderId, refundId: rzpRefund.id },
      "razorpay refund succeeded",
    );
  }

  const updatedOrder = await db.$transaction(async (tx) => {
    // 1. Stock side effects — release when we abandon (never shipped) or
    //    when we're refunding a paid-but-unshipped order.
    const releaseFrom: OrderStatus[] = ["PENDING", "CONFIRMED", "PAID"];
    const releaseTo: OrderStatus[] = ["CANCELLED", "FAILED", "REFUNDED"];
    const shouldReleaseStock =
      !opts.skipSideEffects &&
      releaseFrom.includes(before.status) &&
      releaseTo.includes(to);

    if (shouldReleaseStock) {
      for (const item of before.items) {
        await tx.productVariant.update({
          where: { id: item.variantId },
          data: { stock: { increment: item.quantity } },
        });
      }
      logger.info(
        { orderId, items: before.items.length },
        "state machine released stock",
      );
    }

    // 2. Payment row bookkeeping.
    const codCollected =
      before.payment?.provider === "cod" && to === "DELIVERED";
    if (
      before.payment &&
      (opts.paymentUpdate || to === "REFUNDED" || codCollected)
    ) {
      await tx.payment.update({
        where: { orderId },
        data: {
          ...(opts.paymentUpdate?.providerPaymentId
            ? { providerPaymentId: opts.paymentUpdate.providerPaymentId }
            : {}),
          ...(opts.paymentUpdate?.rawPayload
            ? { rawPayload: opts.paymentUpdate.rawPayload }
            : refundRawPayload
              ? { rawPayload: refundRawPayload }
              : {}),
          ...(opts.paymentUpdate?.status
            ? { status: opts.paymentUpdate.status }
            : to === "REFUNDED"
              ? { status: "REFUNDED" as const }
              : codCollected
                ? { status: "CAPTURED" as const }
                : {}),
        },
      });
    }

    // 3. Status change.
    const updated = await tx.order.update({
      where: { id: orderId },
      data: { status: to },
    });

    // 4. Loyalty accounting is part of the same transaction as the order.
    await handleLoyaltyTransition(tx, {
      orderId,
      userId: before.userId,
      total: before.total,
      couponCode: before.couponCode,
      paymentMethod: before.paymentMethod,
      to,
    });

    // 5. Audit row — never optional. If we ever add a "quiet" transition,
    //    it still writes history but with a marker in the note.
    await tx.orderStatusHistory.create({
      data: {
        orderId,
        fromStatus: before.status,
        toStatus: to,
        actorKind: opts.actor.kind,
        actorId:
          opts.actor.kind === "customer" || opts.actor.kind === "admin"
            ? opts.actor.userId
            : null,
        note: opts.actor.note ?? null,
      },
    });

    if (before.paymentMethod === "PREPAID" && to === "PAID") {
      await createOrderAdminNotification(tx, {
        type: "ORDER_PAID",
        orderId,
        total: before.total,
        currency: before.currency,
        contactEmail: before.contactEmail,
      });
    }

    logger.info(
      { orderId, from: before.status, to, actor: opts.actor.kind },
      "order transitioned",
    );

    return updated;
  });

  void sendOrderStatusEmail(orderId, to).catch((err) => {
    logger.error({ err, orderId, status: to }, "order email failed");
  });
  if (before.paymentMethod === "PREPAID" && to === "PAID") {
    void sendAdminOrderNotificationEmail(orderId, "ORDER_PAID").catch((err) => {
      logger.error({ err, orderId }, "admin paid-order email failed");
    });
  }

  return updatedOrder;
}

/**
 * Write the initial history row when an order is first created. The state
 * machine only handles transitions FROM an existing status; creation is a
 * "PENDING at t=0" event that we log directly here.
 */
export async function recordInitialHistory(
  tx: TxOrClient,
  orderId: string,
  actor: Actor,
  initialStatus: OrderStatus = "PENDING",
) {
  await tx.orderStatusHistory.create({
    data: {
      orderId,
      fromStatus: null,
      toStatus: initialStatus,
      actorKind: actor.kind,
      actorId:
        actor.kind === "customer" || actor.kind === "admin"
          ? actor.userId
          : null,
      note: actor.note ?? "order created",
    },
  });
}
