import type { Request, Response, NextFunction } from "express";
import { getFirebaseAdmin } from "../lib/firebase.js";
import { redis } from "../config/redis.js";
import { prisma } from "../config/db.js";
import { HttpError } from "./errorHandler.js";
import { logger } from "../config/logger.js";
import {
  DEVICE_SESSION_HEADER,
  validateUserSession,
} from "../modules/account/accountSession.service.js";

const USER_CACHE_PREFIX = "auth:user:";
const USER_CACHE_TTL = 60; // seconds
export const REVOCATION_KEY = (uid: string) => `auth:revoked:${uid}`;
// Firebase ID tokens are valid for up to 1 hour, so revocation must outlive a token.
export const REVOCATION_TTL = 60 * 60;

export type Role = "CUSTOMER" | "ADMIN";
export type AccountStatus = "ACTIVE" | "DELETION_PENDING";

export interface AuthContext {
  uid: string;
  userId: string;
  email: string;
  role: Role;
  accountStatus: AccountStatus;
  sessionId?: string;
  authenticatedAt: number;
}

interface CachedUser {
  id: string;
  email: string;
  role: Role;
  accountStatus: AccountStatus;
  sessionTrackingEnabled: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

async function resolveUser(uid: string): Promise<CachedUser | null> {
  const cacheKey = `${USER_CACHE_PREFIX}${uid}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached) as CachedUser;
    } catch {
      // fall through to db
    }
  }
  const user = await prisma.user.findUnique({
    where: { firebaseUid: uid },
    select: { id: true, email: true, role: true, accountStatus: true, sessionTrackingEnabled: true },
  });
  if (!user) return null;
  const payload: CachedUser = {
    id: user.id,
    email: user.email,
    role: user.role,
    accountStatus: user.accountStatus,
    sessionTrackingEnabled: user.sessionTrackingEnabled,
  };
  await redis.set(cacheKey, JSON.stringify(payload), "EX", USER_CACHE_TTL);
  return payload;
}

function firebaseTokenError(error: unknown) {
  const code = (error as { code?: string } | null)?.code;
  if (code === "auth/id-token-revoked" || code === "auth/user-disabled") {
    return new HttpError(401, "token_revoked", "Session was revoked");
  }
  return new HttpError(401, "invalid_token", "Token verification failed");
}

async function authenticate(
  req: Request,
  next: NextFunction,
  allowDeletionPending: boolean,
  checkFirebaseRevocation = true,
) {
  try {
    const header = req.header("Authorization");
    if (!header?.startsWith("Bearer ")) {
      throw new HttpError(401, "unauthenticated", "Missing bearer token");
    }
    const token = header.slice(7).trim();
    if (!token) {
      throw new HttpError(401, "unauthenticated", "Empty bearer token");
    }

    const admin = getFirebaseAdmin();
    // Password and email changes can happen directly through Firebase. The
    // authoritative revocation check prevents an old one-hour ID token from
    // continuing to access protected APIs after those security events.
    const decoded = await admin.auth().verifyIdToken(token, checkFirebaseRevocation);

    const revoked = await redis.exists(REVOCATION_KEY(decoded.uid));
    if (revoked) {
      throw new HttpError(401, "token_revoked", "Session was revoked");
    }

    const user = await resolveUser(decoded.uid);
    if (!user) {
      throw new HttpError(
        401,
        "user_not_synced",
        "Sign in was verified, but no user record exists. Call POST /auth/session first.",
      );
    }

    if (user.accountStatus !== "ACTIVE" && !allowDeletionPending) {
      throw new HttpError(
        403,
        "account_deletion_pending",
        "Account deletion is pending. Restore the account to continue.",
      );
    }
    let sessionId: string | undefined;
    if (user.sessionTrackingEnabled) {
      const deviceToken = req.header(DEVICE_SESSION_HEADER)?.trim();
      if (!deviceToken) {
        throw new HttpError(401, "device_session_required", "Sign in again on this device");
      }
      if (deviceToken.length < 32 || deviceToken.length > 200) {
        throw new HttpError(401, "invalid_device_session", "Device session is invalid");
      }
      sessionId = await validateUserSession(user.id, deviceToken);
    }


    // The database is authoritative. Custom claims can remain stale for a
    // short period on already-issued Firebase tokens after a role change.
    // Never let a stale ADMIN claim bypass a DB demotion.
    req.auth = {
      uid: decoded.uid,
      userId: user.id,
      email: user.email,
      role: user.role,
      accountStatus: user.accountStatus,
      authenticatedAt: decoded.auth_time,
      sessionId,
    };
    next();
  } catch (err) {
    if (err instanceof HttpError) return next(err);
    logger.warn({ err }, "auth verification failed");
    next(firebaseTokenError(err));
  }
}

export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  await authenticate(req, next, false);
}

/**
 * Firebase revokes tokens as part of a password change. This authenticator is
 * limited to recording that security event: it still requires a known active
 * device session, the Redis application-revocation marker, and recent auth.
 * All ordinary API routes continue to verify Firebase revocation strictly.
 */
export async function requireAccountSecurityEventAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  await authenticate(req, next, false, false);
}

/** Used only while a customer is restoring an account during its grace period. */
export async function requireAccountRecoveryAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  await authenticate(req, next, true);
}

export function requireRole(...allowed: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      return next(new HttpError(401, "unauthenticated", "Not authenticated"));
    }
    if (!allowed.includes(req.auth.role)) {
      return next(new HttpError(403, "forbidden", "Insufficient role"));
    }
    next();
  };
}
