import { Prisma } from "@prisma/client";
import { getFirebaseAdmin } from "../../lib/firebase.js";
import { prisma } from "../../config/db.js";
import { redis } from "../../config/redis.js";
import { logger } from "../../config/logger.js";
import { HttpError } from "../../middleware/errorHandler.js";
import {
  REVOCATION_KEY,
  REVOCATION_TTL,
  type AccountStatus,
  type Role,
} from "../../middleware/auth.js";
import { applyVerifiedEmailChange } from "../account/account.service.js";

import {
  registerUserSession,
  revokeAllUserSessions,
} from "../account/accountSession.service.js";
const USER_CACHE_PREFIX = "auth:user:";

export interface AuthUser {
  id: string;
  firebaseUid: string;
  email: string;
  name: string | null;
  role: Role;
  accountStatus: AccountStatus;
  deletionScheduledFor: Date | null;
}

async function invalidateUserCache(uid: string) {
  await redis.del(`${USER_CACHE_PREFIX}${uid}`);
}

export async function syncSession(
  idToken: string,
  device: {
    token: string;
    userAgent?: string;
  },
): Promise<AuthUser> {
  const admin = getFirebaseAdmin();
  // Session creation is the one place where Firebase's authoritative
  // revocation state is checked. A fresh login is then allowed to replace our
  // one-hour hot-path Redis marker left by a previous logout.
  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(idToken, true);
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (code === "auth/id-token-revoked" || code === "auth/user-disabled") {
      throw new HttpError(401, "token_revoked", "Session was revoked");
    }
    throw new HttpError(401, "invalid_token", "Token verification failed");
  }

  if (!decoded.email) {
    throw new HttpError(
      400,
      "email_required",
      "Firebase token has no email address",
    );
  }
  const firebaseEmail = decoded.email.trim().toLowerCase();

  let user = await prisma.user.findUnique({
    where: { firebaseUid: decoded.uid },
  });
  let verifiedEmailChanged = false;
  try {
    if (!user) {
      user = await prisma.user.create({
        data: {
          firebaseUid: decoded.uid,
          email: firebaseEmail,
          name: decoded.name ?? null,
        },
      });
    } else {
      if (user.email !== firebaseEmail) {
        await applyVerifiedEmailChange(user.id, firebaseEmail);
        verifiedEmailChanged = true;
      }
      user = await prisma.user.update({
        where: { id: user.id },
        data: decoded.name ? { name: decoded.name } : {},
      });
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new HttpError(409, "email_unavailable", "That email address is unavailable");
    }
    throw error;
  }

  const claimRole = decoded.role as Role | undefined;
  if (claimRole !== user.role) {
    await admin.auth().setCustomUserClaims(decoded.uid, { role: user.role });
    logger.info(
      { uid: decoded.uid, role: user.role },
      "custom claim synced from db",
    );
  }

  await registerUserSession({
    userId: user.id,
    token: device.token,
    userAgent: device.userAgent,
    authenticatedAt: decoded.auth_time,
    trackingAlreadyEnabled: user.sessionTrackingEnabled,
    registrationAfterVerifiedIdentityChange: verifiedEmailChanged,
  });

  await Promise.all([
    redis.del(REVOCATION_KEY(decoded.uid)),
    invalidateUserCache(decoded.uid),
  ]);

  return {
    id: user.id,
    firebaseUid: user.firebaseUid,
    email: user.email,
    name: user.name,
    role: user.role,
    accountStatus: user.accountStatus,
    deletionScheduledFor: user.deletionScheduledFor,
  };
}

export async function revokeSession(uid: string): Promise<void> {
  const admin = getFirebaseAdmin();
  const user = await prisma.user.findUnique({ where: { firebaseUid: uid }, select: { id: true } });
  await Promise.all([
    admin.auth().revokeRefreshTokens(uid),
    redis.set(REVOCATION_KEY(uid), "1", "EX", REVOCATION_TTL),
    invalidateUserCache(uid),
    ...(user ? [revokeAllUserSessions(user.id)] : []),
  ]);
  logger.info({ uid }, "session revoked");
}

export async function updateUserRole(
  userId: string,
  role: Role,
): Promise<AuthUser> {
  const admin = getFirebaseAdmin();

  const changed = await prisma.user.updateMany({
    where: { id: userId, accountStatus: "ACTIVE" },
    data: { role },
  });
  if (changed.count !== 1) {
    throw new HttpError(409, "account_unavailable", "User account is not active");
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.accountStatus !== "ACTIVE") {
    throw new HttpError(409, "account_unavailable", "User account is not active");
  }

  await Promise.all([
    admin.auth().setCustomUserClaims(user.firebaseUid, { role }),
    admin.auth().revokeRefreshTokens(user.firebaseUid),
    redis.set(REVOCATION_KEY(user.firebaseUid), "1", "EX", REVOCATION_TTL),
    invalidateUserCache(user.firebaseUid),
    revokeAllUserSessions(user.id),
  ]);

  return {
    id: user.id,
    firebaseUid: user.firebaseUid,
    email: user.email,
    name: user.name,
    role: user.role,
    accountStatus: user.accountStatus,
    deletionScheduledFor: user.deletionScheduledFor,
  };
}
