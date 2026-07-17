import { prisma } from "../../config/db.js";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { HttpError } from "../../middleware/errorHandler.js";
import { transition } from "../orders/stateMachine.js";
import { isReservationExpired } from "./checkoutExpiry.policy.js";

const RACE_CODES = new Set(["invalid_transition", "order_status_changed"]);

export async function expireCheckoutReservation(
  orderId: string,
  now = new Date(),
): Promise<boolean> {
  const candidate = await prisma.order.findUnique({
    where: { id: orderId },
    select: { status: true, reservationExpiresAt: true },
  });
  if (!candidate || !isReservationExpired({ ...candidate, now })) return false;

  try {
    await transition(prisma, orderId, "CANCELLED", {
      actor: { kind: "system", note: "checkout reservation expired" },
      paymentUpdate: { status: "FAILED" },
      transactionWork: async (tx) => {
        const marked = await tx.order.updateMany({
          where: {
            id: orderId,
            status: "PENDING",
            reservationExpiresAt: { lte: now },
            reservationExpiredAt: null,
          },
          data: { reservationExpiredAt: now },
        });
        if (marked.count !== 1) {
          throw new HttpError(
            409,
            "order_status_changed",
            "Order changed before its reservation could expire",
          );
        }
      },
    });
    return true;
  } catch (error) {
    if (error instanceof HttpError && RACE_CODES.has(error.code)) return false;
    throw error;
  }
}

export async function processExpiredCheckoutReservations(input?: {
  now?: Date;
  batchSize?: number;
}) {
  const now = input?.now ?? new Date();
  const batchSize = input?.batchSize ?? env.CHECKOUT_EXPIRY_BATCH_SIZE;
  const candidates = await prisma.order.findMany({
    where: {
      status: "PENDING",
      reservationExpiresAt: { lte: now },
      reservationExpiredAt: null,
    },
    orderBy: [{ reservationExpiresAt: "asc" }, { id: "asc" }],
    take: batchSize,
    select: { id: true },
  });

  let expired = 0;
  let skipped = 0;
  let failed = 0;
  for (const candidate of candidates) {
    try {
      if (await expireCheckoutReservation(candidate.id, now)) expired += 1;
      else skipped += 1;
    } catch (error) {
      failed += 1;
      logger.error(
        { err: error, orderId: candidate.id },
        "checkout reservation expiry failed",
      );
    }
  }

  return { candidates: candidates.length, expired, skipped, failed };
}
