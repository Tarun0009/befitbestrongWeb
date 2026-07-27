import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/db.js";
import { env } from "../../config/env.js";
import { redis } from "../../config/redis.js";
import { getFirebaseAdmin } from "../../lib/firebase.js";
import { REVOCATION_KEY } from "../../middleware/auth.js";
import { HttpError } from "../../middleware/errorHandler.js";
import { invalidateCatalog } from "../products/products.service.js";
import {
  queueAccountSecurityEmail,
  queueEmailChangeConfirmation,
} from "./accountSecurityEmail.service.js";

const USER_CACHE_PREFIX = "auth:user:";
const ACTIVE_ORDER_STATUSES = ["PENDING", "CONFIRMED", "PAID", "SHIPPED"] as const;
const OPEN_REFUND_STATUSES = [
  "REQUESTED",
  "PROCESSING",
  "PENDING",
  "RECONCILIATION_REQUIRED",
] as const;

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function eventId(prefix: string, now = new Date()) {
  return `${prefix}-${now.getTime()}-${randomUUID()}`;
}

async function lockUser(tx: Prisma.TransactionClient, userId: string) {
  await tx.$queryRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${`account/${userId}`}, 0))::text AS locked
  `;
}

export async function requestEmailChange(userId: string, requestedEmail: string) {
  const newEmail = normalizeEmail(requestedEmail);
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + env.ACCOUNT_EMAIL_CHANGE_TTL_MINUTES * 60_000,
  );

  // Release abandoned pending addresses before enforcing uniqueness.
  await prisma.user.updateMany({
    where: {
      OR: [
        { id: userId, emailChangeExpiresAt: { lt: now } },
        { pendingEmail: newEmail, emailChangeExpiresAt: { lt: now } },
      ],
    },
    data: {
      pendingEmail: null,
      emailChangeRequestedAt: null,
      emailChangeExpiresAt: null,
    },
  });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      accountStatus: true,
      pendingEmail: true,
    },
  });
  if (!user || user.accountStatus !== "ACTIVE") {
    throw new HttpError(404, "user_not_found", "User not found");
  }
  if (newEmail === user.email) {
    throw new HttpError(409, "email_unchanged", "That is already your email address");
  }
  if (user.pendingEmail) {
    throw new HttpError(
      409,
      "email_change_already_pending",
      "Confirm the pending email change or wait for it to expire before requesting another",
    );
  }

  const duplicate = await prisma.user.findFirst({
    where: {
      id: { not: user.id },
      OR: [{ email: newEmail }, { pendingEmail: newEmail }],
    },
    select: { id: true },
  });
  if (duplicate) {
    // Do not disclose whether the address is current or merely pending.
    throw new HttpError(409, "email_unavailable", "That email address is unavailable");
  }

  const verificationLink = await getFirebaseAdmin()
    .auth()
    .generateVerifyAndChangeEmailLink(user.email, newEmail, {
      url: new URL("/account/settings?emailChange=complete", env.FRONTEND_URL).toString(),
      handleCodeInApp: false,
    });
  const requestEventId = eventId("requested", now);

  try {
    await prisma.$transaction(async (tx) => {
      await lockUser(tx, user.id);
      const current = await tx.user.findUnique({
        where: { id: user.id },
        select: { email: true, accountStatus: true },
      });
      if (!current || current.accountStatus !== "ACTIVE") {
        throw new HttpError(409, "account_unavailable", "Account is unavailable");
      }

      await tx.user.update({
        where: { id: user.id },
        data: {
          pendingEmail: newEmail,
          emailChangeRequestedAt: now,
          emailChangeExpiresAt: expiresAt,
        },
      });
      await queueAccountSecurityEmail(tx, {
        userId: user.id,
        eventId: requestEventId,
        recipientEmail: current.email,
        subject: "Email change requested for your beFitBeStrong account",
        title: "Email change requested",
        message: `A request was made to change your sign-in email to ${newEmail}. Your current email remains active until the new address is confirmed.`,
      });
      await queueEmailChangeConfirmation(tx, {
        userId: user.id,
        eventId: requestEventId,
        recipientEmail: newEmail,
        verificationLink,
        expiresInMinutes: env.ACCOUNT_EMAIL_CHANGE_TTL_MINUTES,
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new HttpError(409, "email_unavailable", "That email address is unavailable");
    }
    throw error;
  }

  return { pendingEmail: newEmail, expiresAt };
}

/**
 * Firebase changes the provider email only after its OOB link is confirmed.
 * Session sync accepts that new email only when it matches our unexpired
 * request, preventing an out-of-band provider edit from silently replacing
 * the application's login identity.
 */
export async function applyVerifiedEmailChange(userId: string, firebaseEmail: string) {
  const normalized = normalizeEmail(firebaseEmail);
  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    await lockUser(tx, userId);
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firebaseUid: true,
        pendingEmail: true,
        emailChangeExpiresAt: true,
        accountStatus: true,
      },
    });
    if (!user) throw new HttpError(401, "user_not_synced", "User not found");
    if (user.email === normalized) return user;
    if (
      user.accountStatus !== "ACTIVE" ||
      user.pendingEmail !== normalized ||
      !user.emailChangeExpiresAt ||
      user.emailChangeExpiresAt <= now
    ) {
      throw new HttpError(
        409,
        "email_change_not_requested",
        "The verified email does not match an active email-change request",
      );
    }

    const previousEmail = user.email;
    const updated = await tx.user.update({
      where: { id: user.id },
      data: {
        email: normalized,
        pendingEmail: null,
        emailChangeRequestedAt: null,
        emailChangeExpiresAt: null,
        emailChangedAt: now,
      },
    });
    const completedEventId = eventId("completed", now);
    await tx.userSession.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: now },
    });
    await queueAccountSecurityEmail(tx, {
      userId: user.id,
      eventId: `${completedEventId}-old`,
      recipientEmail: previousEmail,
      subject: "Your beFitBeStrong email was changed",
      title: "Sign-in email changed",
      message: `Your sign-in email was changed to ${normalized}.`,
    });
    await queueAccountSecurityEmail(tx, {
      userId: user.id,
      eventId: `${completedEventId}-new`,
      recipientEmail: normalized,
      subject: "Your new beFitBeStrong email is active",
      title: "Email change complete",
      message: "This address is now the sign-in email for your account.",
    });
    return updated;
  });

  // An email change alters an account-recovery identifier. Revoke every
  // pre-change application session. The just-verified browser is registered
  // again by syncSession after this function returns; every older device must
  // perform a fresh Firebase sign-in before it can register again.
  await redis.del(`${USER_CACHE_PREFIX}${updated.firebaseUid}`);
  return updated;
}

export async function queuePasswordChangedNotice(userId: string) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findFirst({
      where: { id: userId, accountStatus: "ACTIVE" },
      select: { id: true, email: true },
    });
    if (!user) throw new HttpError(404, "user_not_found", "User not found");
    return queueAccountSecurityEmail(tx, {
      userId: user.id,
      eventId: eventId("password-changed", now),
      recipientEmail: user.email,
      subject: "Your beFitBeStrong password was changed",
      title: "Password changed",
      message: "Your account password was changed and all existing sessions were signed out.",
    });
  });
}

export async function requestAccountDeletion(userId: string) {
  const now = new Date();
  const scheduledFor = new Date(
    now.getTime() + env.ACCOUNT_DELETION_GRACE_DAYS * 24 * 60 * 60_000,
  );

  const user = await prisma.$transaction(async (tx) => {
    await lockUser(tx, userId);
    const current = await tx.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firebaseUid: true,
        email: true,
        role: true,
        accountStatus: true,
        deletionScheduledFor: true,
      },
    });
    if (!current) throw new HttpError(404, "user_not_found", "User not found");
    if (current.role === "ADMIN") {
      throw new HttpError(
        409,
        "admin_account_deletion_forbidden",
        "Remove administrator access before deleting this account",
      );
    }
    if (current.accountStatus === "DELETION_PENDING") return current;

    const [activeOrders, openRefunds] = await Promise.all([
      tx.order.count({
        where: { userId, status: { in: [...ACTIVE_ORDER_STATUSES] } },
      }),
      tx.refundIntent.count({
        where: {
          order: { userId },
          status: { in: [...OPEN_REFUND_STATUSES] },
        },
      }),
    ]);
    if (activeOrders > 0 || openRefunds > 0) {
      throw new HttpError(
        409,
        "active_orders_exist",
        "Account deletion is unavailable while an order or refund is active",
      );
    }

    const updated = await tx.user.update({
      where: { id: userId },
      data: {
        accountStatus: "DELETION_PENDING",
        deletionRequestedAt: now,
        deletionScheduledFor: scheduledFor,
        pendingEmail: null,
        emailChangeRequestedAt: null,
        emailChangeExpiresAt: null,
      },
      select: {
        id: true,
        firebaseUid: true,
        email: true,
        role: true,
        accountStatus: true,
        deletionScheduledFor: true,
      },
    });
    await queueAccountSecurityEmail(tx, {
      userId,
      eventId: eventId("deletion-requested", now),
      recipientEmail: current.email,
      subject: "beFitBeStrong account deletion requested",
      title: "Account deletion requested",
      message: `Your account is scheduled for permanent deletion on ${scheduledFor.toLocaleDateString("en-IN")}. Sign in before then to restore it.`,
    });
    return updated;
  });

  return user;
}

export async function restoreAccount(userId: string) {
  const now = new Date();
  const user = await prisma.$transaction(async (tx) => {
    await lockUser(tx, userId);
    const current = await tx.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firebaseUid: true,
        email: true,
        accountStatus: true,
        deletionScheduledFor: true,
      },
    });
    if (!current) throw new HttpError(404, "user_not_found", "User not found");
    if (current.accountStatus === "ACTIVE") return current;
    if (!current.deletionScheduledFor || current.deletionScheduledFor <= now) {
      throw new HttpError(
        410,
        "account_recovery_expired",
        "The account recovery period has ended",
      );
    }
    const updated = await tx.user.update({
      where: { id: userId },
      data: {
        accountStatus: "ACTIVE",
        deletionRequestedAt: null,
        deletionScheduledFor: null,
      },
      select: { id: true, firebaseUid: true, email: true, accountStatus: true },
    });
    await queueAccountSecurityEmail(tx, {
      userId,
      eventId: eventId("deletion-restored", now),
      recipientEmail: current.email,
      subject: "Your beFitBeStrong account was restored",
      title: "Account restored",
      message: "The pending deletion request was cancelled and your account is active again.",
    });
    return updated;
  });
  await redis.del(`${USER_CACHE_PREFIX}${user.firebaseUid}`, REVOCATION_KEY(user.firebaseUid));
  return user;
}

async function deleteFirebaseIdentity(firebaseUid: string) {
  try {
    await getFirebaseAdmin().auth().deleteUser(firebaseUid);
  } catch (error) {
    if ((error as { code?: string } | null)?.code !== "auth/user-not-found") throw error;
  }
}

export async function finalizeAccountDeletion(userId: string, force = false) {
  const candidate = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      firebaseUid: true,
      email: true,
      accountStatus: true,
      deletionScheduledFor: true,
    },
  });
  if (!candidate) return { finalized: false as const, reason: "missing" as const };
  if (
    candidate.accountStatus !== "DELETION_PENDING" ||
    (!force && (!candidate.deletionScheduledFor || candidate.deletionScheduledFor > new Date()))
  ) {
    return { finalized: false as const, reason: "not_due" as const };
  }

  const affectedProductIds = await prisma.$transaction(async (tx) => {
    await lockUser(tx, candidate.id);
    const current = await tx.user.findUnique({
      where: { id: candidate.id },
      select: { accountStatus: true, deletionScheduledFor: true },
    });
    if (!current) return [];
    if (
      current.accountStatus !== "DELETION_PENDING" ||
      (!force && (!current.deletionScheduledFor || current.deletionScheduledFor > new Date()))
    ) {
      throw new HttpError(409, "account_deletion_cancelled", "Account deletion was cancelled");
    }

    // Keep the account lock while deleting the provider identity. This makes
    // recovery and final deletion mutually exclusive. If later DB work rolls
    // back, Firebase user-not-found makes the next deletion attempt idempotent.
    await deleteFirebaseIdentity(candidate.firebaseUid);

    const [reviews, orders] = await Promise.all([
      tx.review.findMany({
        where: { userId: candidate.id },
        select: { productId: true },
      }),
      tx.order.findMany({
        where: { userId: candidate.id },
        select: { id: true },
      }),
    ]);
    const productIds = [...new Set(reviews.map((review) => review.productId))];
    const orderIds = orders.map((order) => order.id);
    const redactedEmail = `deleted+${candidate.id}@redacted.invalid`;
    const redactedAddress = {
      redacted: true,
      fullName: "Deleted customer",
      phone: "REDACTED",
      line1: "REDACTED",
      city: "REDACTED",
      state: "REDACTED",
      pincode: "REDACTED",
      country: "IN",
    };

    if (orderIds.length > 0) {
      await Promise.all([
        tx.order.updateMany({
          where: { id: { in: orderIds } },
          data: {
            userId: null,
            contactEmail: redactedEmail,
            guestAccessTokenHash: null,
            addressSnapshot: redactedAddress,
          },
        }),
        tx.payment.updateMany({
          where: { orderId: { in: orderIds } },
          data: { rawPayload: Prisma.JsonNull },
        }),
        tx.paymentAttempt.updateMany({
          where: { payment: { orderId: { in: orderIds } } },
          data: { rawPayload: Prisma.JsonNull },
        }),
        tx.refundIntent.updateMany({
          where: { orderId: { in: orderIds } },
          data: {
            rawPayload: Prisma.JsonNull,
            requestedById: "deleted-account",
            reason: "Account data removed",
            failureMessage: null,
          },
        }),
        tx.refundEvent.updateMany({
          where: { refundIntent: { orderId: { in: orderIds } } },
          data: { payload: Prisma.JsonNull, message: null },
        }),
        tx.courierBooking.updateMany({
          where: { orderId: { in: orderIds } },
          data: {
            request: { redacted: true },
            createdById: "deleted-account",
            labelUrl: null,
            error: null,
          },
        }),
        tx.shipment.updateMany({
          where: { orderId: { in: orderIds } },
          data: {
            metadata: Prisma.JsonNull,
            createdById: null,
            labelUrl: null,
            trackingUrl: null,
            syncError: null,
          },
        }),
        tx.shipmentEvent.updateMany({
          where: { shipment: { orderId: { in: orderIds } } },
          data: { description: "Account data removed", location: null },
        }),
        tx.webhookEvent.updateMany({
          where: { localOrderId: { in: orderIds } },
          data: { payload: { redacted: true } },
        }),
        tx.orderStatusHistory.updateMany({
          where: { orderId: { in: orderIds }, actorId: candidate.id },
          data: { actorId: null },
        }),
        tx.orderStatusHistory.updateMany({
          where: { orderId: { in: orderIds } },
          data: { note: null },
        }),
        tx.adminNotification.updateMany({
          where: { orderId: { in: orderIds } },
          data: {
            message: "Customer details removed; retained order record available.",
            metadata: { redacted: true },
          },
        }),
      ]);
    }

    await tx.serviceAreaRequest.deleteMany({
      where: {
        OR: [{ userId: candidate.id }, { email: candidate.email }],
      },
    });
    await tx.emailOutbox.deleteMany({
      where: {
        OR: [
          { recipientEmail: candidate.email },
          { referenceType: "User", referenceId: candidate.id },
          {
            referenceType: "Order",
            referenceId: { in: orderIds },
          },
        ],
      },
    });
    await tx.user.delete({ where: { id: candidate.id } });

    for (const productId of productIds) {
      const aggregate = await tx.review.aggregate({
        where: { productId, status: "APPROVED" },
        _avg: { rating: true },
        _count: { rating: true },
      });
      await tx.product.update({
        where: { id: productId },
        data: {
          ratingAvg: Math.round((aggregate._avg.rating ?? 0) * 100) / 100,
          ratingCount: aggregate._count.rating,
        },
      });
    }
    return productIds;
  }, {
    maxWait: 5_000,
    timeout: 20_000,
  });

  await redis.del(
    `cart:user:${candidate.id}`,
    `cart:user:${candidate.id}:bundles`,
    `cart:user:${candidate.id}:revision`,
    `${USER_CACHE_PREFIX}${candidate.firebaseUid}`,
    REVOCATION_KEY(candidate.firebaseUid),
  );
  await Promise.allSettled(affectedProductIds.map((productId) => invalidateCatalog(productId)));
  return { finalized: true as const };
}

export async function processDueAccountDeletions(now = new Date()) {
  const candidates = await prisma.user.findMany({
    where: {
      accountStatus: "DELETION_PENDING",
      deletionScheduledFor: { lte: now },
    },
    orderBy: { deletionScheduledFor: "asc" },
    take: env.ACCOUNT_DELETION_BATCH_SIZE,
    select: { id: true },
  });
  const results = [];
  for (const candidate of candidates) {
    results.push(await finalizeAccountDeletion(candidate.id));
  }
  return {
    candidates: candidates.length,
    finalized: results.filter((result) => result.finalized).length,
  };
}
