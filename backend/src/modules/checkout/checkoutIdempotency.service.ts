import { Prisma, type CheckoutAttempt } from "@prisma/client";
import { prisma } from "../../config/db.js";
import { HttpError } from "../../middleware/errorHandler.js";
import type { CartOwner } from "../cart/cart.service.js";
import {
  checkoutKeyHash,
  checkoutOwnerHash,
} from "./checkoutIdempotency.policy.js";

const LEASE_MS = 2 * 60 * 1000;

export interface CheckoutAttemptClaim {
  attempt: CheckoutAttempt;
  completed: boolean;
}

function leaseFrom(now: Date): Date {
  return new Date(now.getTime() + LEASE_MS);
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function assertSameRequest(
  attempt: CheckoutAttempt,
  requestHash: string,
): void {
  if (attempt.requestHash !== requestHash) {
    throw new HttpError(
      409,
      "idempotency_key_reused",
      "This checkout key was already used with different order details",
    );
  }
}

function throwStoredFailure(attempt: CheckoutAttempt): never {
  throw new HttpError(
    attempt.failureStatus ?? 500,
    attempt.failureCode ?? "checkout_failed",
    attempt.failureMessage ?? "Checkout could not be completed",
  );
}

function throwInProgress(attempt: CheckoutAttempt, now: Date): never {
  const retryAfterMs = Math.max(
    1_000,
    attempt.leaseExpiresAt.getTime() - now.getTime(),
  );
  throw new HttpError(
    409,
    "checkout_in_progress",
    "Checkout is already being prepared. Retry with the same key shortly.",
    { retryAfterMs },
  );
}

export async function acquireCheckoutAttempt(input: {
  owner: CartOwner;
  idempotencyKey: string;
  requestHash: string;
  cartRevision: string;
}): Promise<CheckoutAttemptClaim> {
  const now = new Date();
  const ownerHash = checkoutOwnerHash(input.owner);
  const keyHash = checkoutKeyHash(input.idempotencyKey);

  try {
    const attempt = await prisma.checkoutAttempt.create({
      data: {
        ownerHash,
        keyHash,
        requestHash: input.requestHash,
        cartRevision: input.cartRevision,
        leaseExpiresAt: leaseFrom(now),
      },
    });
    return { attempt, completed: false };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }

  let existing = await prisma.checkoutAttempt.findUnique({
    where: { ownerHash_keyHash: { ownerHash, keyHash } },
  });
  if (!existing) {
    const sameCart = await prisma.checkoutAttempt.findUnique({
      where: {
        ownerHash_cartRevision: {
          ownerHash,
          cartRevision: input.cartRevision,
        },
      },
    });
    if (!sameCart) {
      throw new HttpError(
        503,
        "checkout_retry_required",
        "Checkout state is temporarily unavailable. Please retry.",
      );
    }
    if (sameCart.status === "FAILED") {
      if (
        sameCart.orderId &&
        sameCart.requestHash !== input.requestHash
      ) {
        throw new HttpError(
          409,
          "checkout_recovery_required",
          "A reserved order already exists for this cart. Retry the original checkout details or cancel that pending order.",
        );
      }
      const recycled = await prisma.checkoutAttempt.updateMany({
        where: { id: sameCart.id, status: "FAILED" },
        data: {
          keyHash,
          requestHash: input.requestHash,
          status: "PROCESSING",
          leaseExpiresAt: leaseFrom(now),
          failureStatus: null,
          failureCode: null,
          failureMessage: null,
          completedAt: null,
        },
      });
      if (recycled.count === 1) {
        const attempt = await prisma.checkoutAttempt.findUniqueOrThrow({
          where: { id: sameCart.id },
        });
        return { attempt, completed: false };
      }
    }
    if (!existing) {
      throw new HttpError(
        409,
        sameCart.status === "COMPLETED"
          ? "cart_already_checked_out"
          : "cart_checkout_in_progress",
        sameCart.status === "COMPLETED"
          ? "This cart was already submitted. Refresh your cart before paying again."
          : "This cart is already being checked out in another tab.",
      );
    }
  }

  assertSameRequest(existing, input.requestHash);
  if (existing.status === "COMPLETED") {
    return { attempt: existing, completed: true };
  }
  if (existing.status === "FAILED") throwStoredFailure(existing);
  if (existing.leaseExpiresAt > now) throwInProgress(existing, now);

  const reclaimed = await prisma.checkoutAttempt.updateMany({
    where: {
      id: existing.id,
      status: "PROCESSING",
      leaseExpiresAt: { lte: now },
    },
    data: { leaseExpiresAt: leaseFrom(now) },
  });
  if (reclaimed.count === 0) throwInProgress(existing, now);

  const attempt = await prisma.checkoutAttempt.findUniqueOrThrow({
    where: { id: existing.id },
  });
  return { attempt, completed: false };
}

export async function markCheckoutAttemptFailed(
  attemptId: string,
  error: unknown,
): Promise<void> {
  const failure =
    error instanceof HttpError
      ? { status: error.status, code: error.code, message: error.message }
      : {
          status: 500,
          code: "internal_error",
          message: "Checkout could not be completed",
        };

  await prisma.checkoutAttempt.updateMany({
    where: { id: attemptId, status: "PROCESSING" },
    data: {
      status: "FAILED",
      failureStatus: failure.status,
      failureCode: failure.code,
      failureMessage: failure.message,
    },
  });
}
