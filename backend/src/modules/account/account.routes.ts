import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { rateLimitPolicies } from "../../config/rateLimitConfig.js";
import {
  requireAccountSecurityEventAuth,
  requireAccountRecoveryAuth,
  requireAuth,
} from "../../middleware/auth.js";
import { HttpError } from "../../middleware/errorHandler.js";
import { rateLimit } from "../../middleware/rateLimit.js";
import { revokeSession } from "../auth/auth.service.js";
import {
  finalizeAccountDeletion,
  queuePasswordChangedNotice,
  requestAccountDeletion,
  requestEmailChange,
  restoreAccount,
} from "./account.service.js";
import {
  DEVICE_SESSION_HEADER,
  listUserSessions,
  revokeUserSession,
} from "./accountSession.service.js";


const router = Router();
const sensitiveRateLimit = rateLimit({
  keyPrefix: "account-security",
  ...rateLimitPolicies.auth,
  accountKeyBy: (req) => req.auth?.userId,
});

const emailChangeBody = z
  .object({
    newEmail: z.string().trim().email().max(254),
  })
  .strict();
const deleteBody = z.object({ confirmation: z.literal("DELETE") }).strict();
const sessionParam = z.object({ id: z.string().cuid() }).strict();

function requireRecentAuthentication(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const authenticatedAt = req.auth?.authenticatedAt;
  if (!authenticatedAt) {
    return next(new HttpError(401, "recent_authentication_required", "Sign in again to continue"));
  }
  const ageSeconds = Math.floor(Date.now() / 1000) - authenticatedAt;
  if (ageSeconds > env.ACCOUNT_RECENT_AUTH_MAX_AGE_SECONDS) {
    return next(
      new HttpError(
        401,
        "recent_authentication_required",
        "For your security, sign in again before changing account access",
      ),
    );
  }
  next();
}

router.post(
  "/email-change",
  requireAuth,
  sensitiveRateLimit,
  requireRecentAuthentication,
  async (req, res, next) => {
    try {
      const { newEmail } = emailChangeBody.parse(req.body);
      const result = await requestEmailChange(req.auth!.userId, newEmail);
      res.status(202).json({
        status: "confirmation_required",
        pendingEmail: result.pendingEmail,
        expiresAt: result.expiresAt,
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/security/password-changed",
  requireAccountSecurityEventAuth,
  sensitiveRateLimit,
  requireRecentAuthentication,
  async (req, res, next) => {
    try {
      await queuePasswordChangedNotice(req.auth!.userId);
      await revokeSession(req.auth!.uid);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  "/account",
  requireAuth,
  sensitiveRateLimit,
  requireRecentAuthentication,
  async (req, res, next) => {
    try {
      deleteBody.parse(req.body);
      const deletion = await requestAccountDeletion(req.auth!.userId);
      await revokeSession(req.auth!.uid);
      if (env.ACCOUNT_DELETION_GRACE_DAYS === 0) {
        await finalizeAccountDeletion(deletion.id, true);
      }
      res.status(202).json({
        status: "deletion_pending",
        scheduledFor: deletion.deletionScheduledFor,
      });
    } catch (error) {
      next(error);
    }
  },
);
router.get(
  "/sessions",
  requireAuth,
  sensitiveRateLimit,
  async (req, res, next) => {
    try {
      const sessions = await listUserSessions(
        req.auth!.userId,
        req.header(DEVICE_SESSION_HEADER)?.trim(),
      );
      res.json({ sessions });
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  "/sessions/:id",
  requireAuth,
  sensitiveRateLimit,
  async (req, res, next) => {
    try {
      const { id } = sessionParam.parse(req.params);
      const current = req.auth!.sessionId === id;
      await revokeUserSession(req.auth!.userId, id);
      res.json({ revoked: true, current });
    } catch (error) {
      next(error);
    }
  },
);


router.post(
  "/account/restore",
  requireAccountRecoveryAuth,
  sensitiveRateLimit,
  async (req, res, next) => {
    try {
      const user = await restoreAccount(req.auth!.userId);
      res.json({
        user: {
          id: user.id,
          email: user.email,
          accountStatus: user.accountStatus,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
