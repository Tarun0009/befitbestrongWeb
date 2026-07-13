import type { Request, Response, NextFunction } from "express";
import { getFirebaseAdmin } from "../lib/firebase.js";
import { redis } from "../config/redis.js";
import { prisma } from "../config/db.js";
import { logger } from "../config/logger.js";
import { REVOCATION_KEY, type Role } from "./auth.js";

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
    const decoded = await admin.auth().verifyIdToken(token, false);

    const revoked = await redis.exists(REVOCATION_KEY(decoded.uid));
    if (revoked) return next();

    const cacheKey = `${USER_CACHE_PREFIX}${decoded.uid}`;
    const cached = await redis.get(cacheKey);
    let user: { id: string; email: string; role: Role } | null = null;
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
        select: { id: true, email: true, role: true },
      });
      if (!dbUser) return next();
      user = { id: dbUser.id, email: dbUser.email, role: dbUser.role };
      await redis.set(cacheKey, JSON.stringify(user), "EX", USER_CACHE_TTL);
    }

    const claimRole = decoded.role as Role | undefined;
    req.auth = {
      uid: decoded.uid,
      userId: user.id,
      email: user.email,
      role: claimRole ?? user.role,
    };
  } catch (err) {
    logger.debug({ err }, "optionalAuth: token invalid, treating as anonymous");
  }

  next();
}
