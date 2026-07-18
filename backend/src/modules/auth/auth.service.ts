import { getFirebaseAdmin } from "../../lib/firebase.js";
import { prisma } from "../../config/db.js";
import { redis } from "../../config/redis.js";
import { logger } from "../../config/logger.js";
import { HttpError } from "../../middleware/errorHandler.js";
import {
  REVOCATION_KEY,
  REVOCATION_TTL,
  type Role,
} from "../../middleware/auth.js";

const USER_CACHE_PREFIX = "auth:user:";

export interface AuthUser {
  id: string;
  firebaseUid: string;
  email: string;
  name: string | null;
  role: Role;
}

async function invalidateUserCache(uid: string) {
  await redis.del(`${USER_CACHE_PREFIX}${uid}`);
}

export async function syncSession(idToken: string): Promise<AuthUser> {
  const admin = getFirebaseAdmin();
  // Session creation is the one place where Firebase's authoritative
  // revocation state is checked. A fresh login is then allowed to replace our
  // one-hour hot-path Redis marker left by a previous logout.
  const decoded = await admin.auth().verifyIdToken(idToken, true);

  if (!decoded.email) {
    throw new HttpError(
      400,
      "email_required",
      "Firebase token has no email address",
    );
  }

  const user = await prisma.user.upsert({
    where: { firebaseUid: decoded.uid },
    create: {
      firebaseUid: decoded.uid,
      email: decoded.email,
      name: decoded.name ?? null,
    },
    update: {
      email: decoded.email,
      ...(decoded.name ? { name: decoded.name } : {}),
    },
  });

  const claimRole = decoded.role as Role | undefined;
  if (claimRole !== user.role) {
    await admin.auth().setCustomUserClaims(decoded.uid, { role: user.role });
    logger.info(
      { uid: decoded.uid, role: user.role },
      "custom claim synced from db",
    );
  }

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
  };
}

export async function revokeSession(uid: string): Promise<void> {
  const admin = getFirebaseAdmin();
  await Promise.all([
    admin.auth().revokeRefreshTokens(uid),
    redis.set(REVOCATION_KEY(uid), "1", "EX", REVOCATION_TTL),
    invalidateUserCache(uid),
  ]);
  logger.info({ uid }, "session revoked");
}

export async function updateUserRole(
  userId: string,
  role: Role,
): Promise<AuthUser> {
  const admin = getFirebaseAdmin();

  const user = await prisma.user.update({
    where: { id: userId },
    data: { role },
  });

  await Promise.all([
    admin.auth().setCustomUserClaims(user.firebaseUid, { role }),
    admin.auth().revokeRefreshTokens(user.firebaseUid),
    redis.set(REVOCATION_KEY(user.firebaseUid), "1", "EX", REVOCATION_TTL),
    invalidateUserCache(user.firebaseUid),
  ]);

  return {
    id: user.id,
    firebaseUid: user.firebaseUid,
    email: user.email,
    name: user.name,
    role: user.role,
  };
}
