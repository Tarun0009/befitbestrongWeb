import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import { rateLimit } from "../../middleware/rateLimit.js";
import { rateLimitPolicies } from "../../config/rateLimitConfig.js";
import {
  applyReferralCode,
  getLoyaltyAccount,
  redeemPoints,
} from "./loyalty.service.js";

const router = Router();
router.use(
  requireAuth,
  rateLimit({
    keyPrefix: "loyalty",
    ...rateLimitPolicies.authenticated,
    accountKeyBy: (req) => req.auth?.userId,
  }),
);

router.get("/", async (req, res, next) => {
  try {
    const result = await getLoyaltyAccount(req.auth!.userId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/referral", async (req, res, next) => {
  try {
    const body = z
      .object({
        code: z.string().trim().min(4).max(40),
      })
      .strict()
      .parse(req.body);
    const result = await applyReferralCode(req.auth!.userId, body.code);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/redeem", async (req, res, next) => {
  try {
    const body = z
      .object({
        points: z.number().int().positive().max(1_000_000),
      })
      .strict()
      .parse(req.body);
    const result = await redeemPoints(req.auth!.userId, body.points);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
