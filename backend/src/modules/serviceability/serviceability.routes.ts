import { Router } from "express";
import { z } from "zod";
import { optionalAuth } from "../../middleware/optionalAuth.js";
import { rateLimit } from "../../middleware/rateLimit.js";
import {
  getServiceability,
  recordServiceAreaRequest,
} from "./serviceability.service.js";

const router = Router();
router.use(
  rateLimit({
    keyPrefix: "serviceability-preauth",
    max: 300,
    windowSec: 60,
    keyBy: (req) => req.ip ?? "unknown",
  }),
);
router.use(optionalAuth);
const authenticatedServiceabilityLimiter = rateLimit({
  keyPrefix: "serviceability",
  max: 120,
  windowSec: 60,
  keyBy: (req) => req.auth?.userId ?? req.ip ?? "unknown",
});
router.use(authenticatedServiceabilityLimiter);

const pincodeSchema = z.string().trim().regex(/^\d{6}$/);
const requestBody = z.object({
  pincode: pincodeSchema,
  email: z.string().trim().email().max(254).optional(),
  phone: z.string().trim().min(7).max(20).optional(),
  productId: z.string().cuid().optional(),
  source: z
    .enum(["product", "checkout", "cart", "footer", "storefront"])
    .default("storefront"),
});

const serviceabilityLookupLimiter = rateLimit({
  keyPrefix: "serviceability-lookup",
  max: 30,
  windowSec: 60 * 60,
  keyBy: (req) =>
    `${req.auth?.userId ?? req.ip ?? "unknown"}:${String(req.params.pincode ?? "")}`,
});

const serviceAreaRequestLimiter = rateLimit({
  keyPrefix: "service-area-request",
  max: 10,
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

router.post(
  "/requests",
  serviceAreaRequestLimiter,
  async (req, res, next) => {
    try {
      const body = requestBody.parse(req.body);
      await recordServiceAreaRequest({
        ...body,
        userId: req.auth?.userId ?? null,
        accountEmail: req.auth?.email ?? null,
      });
      res.status(202).json({
        accepted: true,
        message:
          "Thanks — we recorded your area and will use it to plan future coverage.",
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;

