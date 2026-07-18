import { Router } from "express";
import { z } from "zod";
import { rateLimit } from "../../middleware/rateLimit.js";
import { listPublicSubscriptionPlans } from "./subscription.service.js";

const router = Router();
router.use(rateLimit({ keyPrefix: "subscription-plans", max: 120, windowSec: 60 }));
router.get("/", async (req, res, next) => {
  try {
    const query = z.object({ variantId: z.string().cuid().optional() }).parse(req.query);
    res.json(await listPublicSubscriptionPlans(query.variantId));
  } catch (error) {
    next(error);
  }
});
export default router;