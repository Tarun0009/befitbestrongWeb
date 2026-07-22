import { Router } from "express";
import { z } from "zod";
import { rateLimit } from "../../middleware/rateLimit.js";
import { rateLimitPolicies } from "../../config/rateLimitConfig.js";
import { listPublicSubscriptionPlans } from "./subscription.service.js";

const router = Router();
router.use(
  rateLimit({
    keyPrefix: "subscription-plans",
    ...rateLimitPolicies.public,
  }),
);
router.get("/", async (req, res, next) => {
  try {
    const query = z.object({ variantId: z.string().cuid().optional() }).strict().parse(req.query);
    res.json(await listPublicSubscriptionPlans(query.variantId));
  } catch (error) {
    next(error);
  }
});
export default router;
