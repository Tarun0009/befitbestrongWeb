import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import { rateLimit } from "../../middleware/rateLimit.js";
import { rateLimitPolicies } from "../../config/rateLimitConfig.js";
import {
  listStockAlerts,
  subscribeStockAlert,
  unsubscribeStockAlert,
} from "./stockAlerts.service.js";

const router = Router();
router.use(
  requireAuth,
  rateLimit({
    keyPrefix: "stock-alerts",
    ...rateLimitPolicies.authenticated,
    accountKeyBy: (req) => req.auth?.userId,
  }),
);

router.get("/", async (req, res, next) => {
  try {
    const result = await listStockAlerts(req.auth!.userId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/:variantId", async (req, res, next) => {
  try {
    const variantId = z.string().cuid().parse(req.params.variantId);
    const result = await subscribeStockAlert(req.auth!.userId, variantId);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.delete("/:variantId", async (req, res, next) => {
  try {
    const variantId = z.string().cuid().parse(req.params.variantId);
    await unsubscribeStockAlert(req.auth!.userId, variantId);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;
