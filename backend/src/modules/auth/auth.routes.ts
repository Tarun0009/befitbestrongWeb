import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import {
  firebaseAccountHint,
  rateLimit,
} from "../../middleware/rateLimit.js";
import { rateLimitPolicies } from "../../config/rateLimitConfig.js";
import { syncSession, revokeSession } from "./auth.service.js";

import { DEVICE_SESSION_HEADER } from "../account/accountSession.service.js";
const router = Router();
const sessionRateLimit = rateLimit({
  keyPrefix: "auth-session",
  ...rateLimitPolicies.auth,
  accountKeyBy: firebaseAccountHint,
});
const authenticatedRateLimit = rateLimit({
  keyPrefix: "auth-user",
  ...rateLimitPolicies.authenticated,
  accountKeyBy: (req) => req.auth?.userId,
});

const sessionBody = z.object({
  idToken: z.string().trim().min(20, "idToken looks too short").max(8192),
}).strict();

router.post("/session", sessionRateLimit, async (req, res, next) => {
  try {
    const { idToken } = sessionBody.parse(req.body);
    const rawDeviceToken = req.header(DEVICE_SESSION_HEADER)?.trim();
    const deviceToken = z.string().min(32).max(200).parse(rawDeviceToken);
    const user = await syncSession(
      idToken,
      { token: deviceToken, userAgent: req.header("user-agent") },
    );
    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        accountStatus: user.accountStatus,
        deletionScheduledFor: user.deletionScheduledFor,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get("/me", requireAuth, authenticatedRateLimit, (req, res) => {
  const auth = req.auth!;
  res.json({
    user: {
      id: auth.userId,
      email: auth.email,
      role: auth.role,
      accountStatus: auth.accountStatus,
    },
  });
});

router.post("/logout", requireAuth, authenticatedRateLimit, async (req, res, next) => {
  try {
    await revokeSession(req.auth!.uid);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
