import { Router } from "express";
import { z } from "zod";
import { optionalAuth } from "../../middleware/optionalAuth.js";
import { rateLimit } from "../../middleware/rateLimit.js";
import { rateLimitPolicies } from "../../config/rateLimitConfig.js";
import { getServiceability } from "./serviceability.service.js";

const router = Router();
router.use(optionalAuth);
const pincodeSchema = z.string().trim().regex(/^[1-9]\d{5}$/);

const serviceabilityLookupLimiter = rateLimit({
  keyPrefix: "serviceability-lookup",
  ...rateLimitPolicies.serviceability,
  accountKeyBy: (req) => req.auth?.userId,
});

router.get(
  "/:pincode",
  serviceabilityLookupLimiter,
  async (req, res, next) => {
    try {
      const pincode = pincodeSchema.parse(req.params.pincode);
      res.json(await getServiceability(pincode));
    } catch (err) {
      next(err);
    }
  },
);

export default router;

