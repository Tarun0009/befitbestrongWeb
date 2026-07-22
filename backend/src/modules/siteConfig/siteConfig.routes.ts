import { Router } from "express";
import { getPublicSiteConfig } from "./siteConfig.service.js";
import { rateLimit } from "../../middleware/rateLimit.js";
import { rateLimitPolicies } from "../../config/rateLimitConfig.js";

const router = Router();
router.use(rateLimit({ keyPrefix: "site-config", ...rateLimitPolicies.public }));

// Public — used by the storefront header + homepage. Cached with a 10 min TTL
// under a tag that the admin editor invalidates on write.
router.get("/", async (_req, res, next) => {
  try {
    const result = await getPublicSiteConfig();
    res.setHeader("X-Cache", result.cached ? "HIT" : "MISS");
    res.json(result.data);
  } catch (err) {
    next(err);
  }
});

export default router;
