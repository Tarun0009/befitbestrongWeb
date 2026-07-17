import { Router } from "express";
import { z } from "zod";
import {
  adjustUserPoints,
  getAdminLoyalty,
  updateLoyaltyConfig,
} from "./loyalty.service.js";
import { requireAtLeastOneField } from "../../lib/validation.js";

const router = Router();

const loyaltyConfigPatchBody = requireAtLeastOneField(
  z
    .object({
      enabled: z.boolean().optional(),
      earnPointsPerRupee: z.number().int().min(0).max(100).optional(),
      redeemPointsPerRupee: z.number().int().min(1).max(10000).optional(),
      minRedeemPoints: z.number().int().min(1).max(1000000).optional(),
      maxRedeemPointsPerCoupon: z
        .number()
        .int()
        .positive()
        .max(1000000)
        .nullable()
        .optional(),
      referralBonusReferrer: z.number().int().min(0).max(1000000).optional(),
      referralBonusReferred: z.number().int().min(0).max(1000000).optional(),
      couponValidityDays: z.number().int().min(1).max(365).optional(),
    })
    .strict(),
);

router.get("/loyalty", async (_req, res, next) => {
  try {
    const result = await getAdminLoyalty();
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.patch("/loyalty/config", async (req, res, next) => {
  try {
    const body = loyaltyConfigPatchBody.parse(req.body);
    const result = await updateLoyaltyConfig(body);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/loyalty/users/:userId/adjust", async (req, res, next) => {
  try {
    const userId = z.string().cuid().parse(req.params.userId);
    const body = z
      .object({
        points: z.number().int().min(-1000000).max(1000000).refine(
          (value) => value !== 0,
          "Points cannot be zero",
        ),
        reason: z.string().trim().min(3).max(300),
      })
      .parse(req.body);
    const result = await adjustUserPoints(
      userId,
      body.points,
      body.reason,
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
