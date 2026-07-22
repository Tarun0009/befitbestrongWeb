import type { OrderStatus, Prisma, PrismaClient } from "@prisma/client";
import { HttpError } from "../../middleware/errorHandler.js";
import { logger } from "../../config/logger.js";
import { queueOrderStatusEmail } from "./orderEmail.service.js";
import { handleLoyaltyTransition } from "../loyalty/loyalty.service.js";
import { createOrderAdminNotification } from "../notifications/adminNotification.service.js";
import { queueAdminOrderNotificationEmail } from "../notifications/adminOrderEmail.service.js";
import { restoreCouponUsage } from "../checkout/coupon.service.js";

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
  /** Skip local side effects such as stock release — used by the webhook worker
   *  when Razorpay already did the payment side and we're just recording it. */
  skipSideEffects?: boolean;
  /** Extra payload merged into the transition — provider ids from webhooks etc. */
  paymentUpdate?: {
    providerPaymentId?: string;
    rawPayload?: object;
    status?: "AUTHORIZED" | "CAPTURED" | "FAILED" | "REFUNDED";
  };
  /** Proof that a durable refund ledger reached the full captured amount. */
  refundFinalization?: {
    refundIntentId: string;
    rawPayload?: object;
  };
  /**
   * Optional fulfillment work that must commit with the status transition.
   * It also runs for an idempotent same-status transition, which allows an
   * additional shipment to be attached to an already-shipped order.
   */
  transactionWork?: (tx: Prisma.TransactionClient) => Promise<void>;
}

/**
 * Run a transition. Throws on invalid moves. Wraps everything in a single
 * DB transaction so the status change, the history row, and any side effects
 * (stock release, refund side-effects, Payment row updates) commit together.
 *
 * Refund provider calls never happen here. Only the refund-ledger service may
 * request REFUNDED after cumulative processed intents equal the payment amount.
 */
export async function transition(
  db: PrismaClient,
  orderId: string,
  to: OrderStatus,
  opts: TransitionOpts,
) {
  // Load immutable transition inputs before opening the write transaction.
  const before = await db.order.findUnique({
    where: { id: orderId },
    include: { items: true, payment: true },
  });
  if (!before) {
    throw new HttpError(404, "order_not_found", "Order not found");
  }
  if (to === "REFUNDED" && !opts.refundFinalization) {
    throw new HttpError(
      409,
      "refund_ledger_required",
      "Orders can only be finalized through a processed refund ledger",
    );
  }
  if (to === "SHIPPED") {
    const activeRefunds = await db.refundIntent.count({
      where: {
        orderId,
        status: {
          in: [
            "REQUESTED",
            "PROCESSING",
            "PENDING",
            "RECONCILIATION_REQUIRED",
            "PROCESSED",
          ],
        },
      },
    });
    if (activeRefunds > 0) {
      throw new HttpError(
        409,
        "refund_in_progress",
        "This order has a refund in progress and cannot be shipped",
      );
    }
  }
  const sameStatus = before.status === to;
  if (sameStatus && !opts.transactionWork) {
    // Idempotent no-op — the worker may deliver the same event twice.
    return before;
  }
  if (!sameStatus && !canTransition(before.status, to)) {
    throw new HttpError(
      409,
      "invalid_transition",
      `Cannot transition ${before.status} → ${to}`,
    );
  }

  const updatedOrder = await db.$transaction(async (tx) => {
    // Serialize every commercial transition for this order. The optimistic
    // update below remains as a second guard, but the row lock also makes
    // payment, cancellation, shipping and refund decisions observe one order.
    await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;
    const locked = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { status: true },
    });
    if (locked.status !== before.status) {
      throw new HttpError(
        409,
        "order_status_changed",
        "Order status changed while this operation was waiting; refresh and retry",
      );
    }
    if (to === "SHIPPED") {
      const activeRefunds = await tx.refundIntent.count({
        where: {
          orderId,
          status: {
            in: [
              "REQUESTED",
              "PROCESSING",
              "PENDING",
              "RECONCILIATION_REQUIRED",
              "PROCESSED",
            ],
          },
        },
      });
      if (activeRefunds > 0) {
        throw new HttpError(
          409,
          "refund_in_progress",
          "This order has a refund in progress and cannot be shipped",
        );
      }
    }

    if (opts.transactionWork) {
      await opts.transactionWork(tx);
    }

    // Same-status fulfillment work commits without producing a duplicate
    // order history entry or repeating status side effects.
    if (sameStatus) {
      return before;
    }

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

    // A coupon is reserved at order creation. Return normal promotion usage
    // when an unpaid order is abandoned. Loyalty coupons stay consumed because
    // handleLoyaltyTransition restores the underlying points instead.
    if (
      !opts.skipSideEffects &&
      (before.status === "PENDING" || before.status === "CONFIRMED") &&
      (to === "CANCELLED" || to === "FAILED")
    ) {
      await restoreCouponUsage(tx, before.couponCode);
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
            : opts.refundFinalization?.rawPayload
              ? { rawPayload: opts.refundFinalization.rawPayload }
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
    const statusUpdate = await tx.order.updateMany({
      where: { id: orderId, status: before.status },
      data: { status: to },
    });
    if (statusUpdate.count !== 1) {
      throw new HttpError(
        409,
        "order_status_changed",
        "Order status changed while this operation was in progress; refresh and retry",
      );
    }
    const updated = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
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

    await queueOrderStatusEmail(tx, orderId, to);
    if (before.paymentMethod === "PREPAID" && to === "PAID") {
      await queueAdminOrderNotificationEmail(tx, orderId, "ORDER_PAID");
    }

    logger.info(
      { orderId, from: before.status, to, actor: opts.actor.kind },
      "order transitioned",
    );

    return updated;
  });

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
