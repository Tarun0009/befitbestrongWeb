import { Router } from "express";
import { z } from "zod";
import { rateLimit } from "../../middleware/rateLimit.js";
import { getServiceability } from "./serviceability.service.js";

const router = Router();
router.use(
  rateLimit({
    keyPrefix: "serviceability-preauth",
    max: 300,
    windowSec: 60,
    keyBy: (req) => req.ip ?? "unknown",
  }),
);
const pincodeSchema = z.string().trim().regex(/^[1-9]\d{5}$/);

const serviceabilityLookupLimiter = rateLimit({
  keyPrefix: "serviceability-lookup",
  max: 30,
  windowSec: 60 * 60,
  keyBy: (req) => req.auth?.userId ?? req.ip ?? "unknown",
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

