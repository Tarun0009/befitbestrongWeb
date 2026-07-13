import { Router } from "express";
import { z } from "zod";
import { listPublicSubscriptionPlans } from "./subscription.service.js";

const router = Router();
router.get("/", async (req, res, next) => {
  try {
    const query = z.object({ variantId: z.string().cuid().optional() }).parse(req.query);
    res.json(await listPublicSubscriptionPlans(query.variantId));
  } catch (error) {
    next(error);
  }
});
export default router;