import type { Request, Response, NextFunction } from "express";
import { getFirebaseAdmin } from "../lib/firebase.js";
import { redis } from "../config/redis.js";
import { prisma } from "../config/db.js";
import { logger } from "../config/logger.js";
import { REVOCATION_KEY, type Role } from "./auth.js";
import {
  DEVICE_SESSION_HEADER,
  validateUserSession,
} from "../modules/account/accountSession.service.js";

const USER_CACHE_PREFIX = "auth:user:";
const USER_CACHE_TTL = 60;

/**
 * Verify the Firebase ID token when one is supplied, populate req.auth if it
 * checks out, but never throw. Used by routes that support both authenticated
 * and anonymous callers (cart, checkout preflight, etc.).
 *
 * A malformed / revoked token silently drops the request to anonymous so a
 * stale client can still browse. Contrast requireAuth which rejects hard.
 */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const header = req.header("Authorization");
  if (!header?.startsWith("Bearer ")) return next();

  const token = header.slice(7).trim();
  if (!token) return next();

  try {
    const admin = getFirebaseAdmin();
    const decoded = await admin.auth().verifyIdToken(token, true);

    const revoked = await redis.exists(REVOCATION_KEY(decoded.uid));
    if (revoked) return next();

    const cacheKey = `${USER_CACHE_PREFIX}${decoded.uid}`;
    const cached = await redis.get(cacheKey);
    let user: {
      id: string;
      email: string;
      role: Role;
      accountStatus: "ACTIVE" | "DELETION_PENDING";
      sessionTrackingEnabled: boolean;
    } | null = null;
    if (cached) {
      try {
        user = JSON.parse(cached);
      } catch {
        /* fall through */
      }
    }
    if (!user) {
      const dbUser = await prisma.user.findUnique({
        where: { firebaseUid: decoded.uid },
        select: {
          id: true,
          email: true,
          role: true,
          accountStatus: true,
          sessionTrackingEnabled: true,
        },
      });
      if (!dbUser || dbUser.accountStatus !== "ACTIVE") return next();
      user = dbUser;
      await redis.set(cacheKey, JSON.stringify(user), "EX", USER_CACHE_TTL);
    }
    if (user.accountStatus !== "ACTIVE") return next();

    let sessionId: string | undefined;
    if (user.sessionTrackingEnabled) {
      const deviceToken = req.header(DEVICE_SESSION_HEADER)?.trim();
      if (!deviceToken || deviceToken.length < 32 || deviceToken.length > 200) {
        return next();
      }
      sessionId = await validateUserSession(user.id, deviceToken);
    }

    req.auth = {
      uid: decoded.uid,
      userId: user.id,
      email: user.email,
      role: user.role,
      accountStatus: user.accountStatus,
      authenticatedAt: decoded.auth_time,
      sessionId,
    };
  } catch (err) {
    logger.debug({ err }, "optionalAuth: token invalid, treating as anonymous");
  }

  next();
}
