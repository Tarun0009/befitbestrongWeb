import type { Request, Response, NextFunction } from "express";
import { getFirebaseAdmin } from "../lib/firebase.js";
import { redis } from "../config/redis.js";
import { prisma } from "../config/db.js";
import { HttpError } from "./errorHandler.js";
import { logger } from "../config/logger.js";

const USER_CACHE_PREFIX = "auth:user:";
const USER_CACHE_TTL = 60; // seconds
export const REVOCATION_KEY = (uid: string) => `auth:revoked:${uid}`;
// Firebase ID tokens are valid for up to 1 hour, so revocation must outlive a token.
export const REVOCATION_TTL = 60 * 60;

export type Role = "CUSTOMER" | "ADMIN";

export interface AuthContext {
  uid: string;
  userId: string;
  email: string;
  role: Role;
}

interface CachedUser {
  id: string;
  email: string;
  role: Role;
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
    select: { id: true, email: true, role: true },
  });
  if (!user) return null;
  const payload: CachedUser = { id: user.id, email: user.email, role: user.role };
  await redis.set(cacheKey, JSON.stringify(payload), "EX", USER_CACHE_TTL);
  return payload;
}

export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
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
    // checkRevoked=false on the hot path — we run our own revocation check via Redis.
    const decoded = await admin.auth().verifyIdToken(token, false);

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

    // The database is authoritative. Custom claims can remain stale for a
    // short period on already-issued Firebase tokens after a role change.
    // Never let a stale ADMIN claim bypass a DB demotion.
    req.auth = {
      uid: decoded.uid,
      userId: user.id,
      email: user.email,
      role: user.role,
    };
    next();
  } catch (err) {
    if (err instanceof HttpError) return next(err);
    logger.warn({ err }, "auth verification failed");
    next(new HttpError(401, "invalid_token", "Token verification failed"));
  }
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
