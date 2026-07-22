import { Router } from "express";
import { z } from "zod";
import {
  getPublicBundle,
  listPublicBundles,
} from "./bundle.service.js";
import { rateLimit } from "../../middleware/rateLimit.js";
import { rateLimitPolicies } from "../../config/rateLimitConfig.js";

const router = Router();
router.use(rateLimit({ keyPrefix: "bundles", ...rateLimitPolicies.public }));

router.get("/", async (_req, res, next) => {
  try {
    res.json(await listPublicBundles());
  } catch (error) {
    next(error);
  }
});

router.get("/:slug", async (req, res, next) => {
  try {
    const slug = z
      .string()
      .trim()
      .min(1)
      .max(160)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .parse(req.params.slug);
    res.json(await getPublicBundle(slug));
  } catch (error) {
    next(error);
  }
});

export default router;
