import { Router } from "express";
import { z } from "zod";
import { searchProducts, SORTS } from "./search.service.js";
import { rateLimit } from "../../middleware/rateLimit.js";
import { rateLimitPolicies } from "../../config/rateLimitConfig.js";

const router = Router();
router.use(rateLimit({ keyPrefix: "search", ...rateLimitPolicies.public }));

const searchQuery = z.object({
  q: z.string().trim().max(200).optional(),
  category: z.string().min(1).optional(),
  minPrice: z.coerce.number().int().nonnegative().optional(),
  maxPrice: z.coerce.number().int().nonnegative().optional(),
  sort: z.enum(SORTS).optional(),
  cursor: z.string().min(1).max(400).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(60).default(12),
}).strict();

router.get("/", async (req, res, next) => {
  try {
    const parsed = searchQuery.parse(req.query);
    const result = await searchProducts(parsed);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
