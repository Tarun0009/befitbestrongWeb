import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import { rateLimit } from "../../middleware/rateLimit.js";
import {
  applyReferralCode,
  getLoyaltyAccount,
  redeemPoints,
} from "./loyalty.service.js";

const router = Router();
router.use(rateLimit({ keyPrefix: "loyalty", max: 30, windowSec: 60 }));
router.use(requireAuth);

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
        points: z.number().int().positive(),
      })
      .parse(req.body);
    const result = await redeemPoints(req.auth!.userId, body.points);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
