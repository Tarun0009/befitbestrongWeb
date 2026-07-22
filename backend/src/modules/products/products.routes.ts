import { Router } from "express";
import { z } from "zod";
import {
  getProductBySlug,
  listCategories,
  listProducts,
} from "./products.service.js";
import { rateLimit } from "../../middleware/rateLimit.js";
import { rateLimitPolicies } from "../../config/rateLimitConfig.js";

const router = Router();
router.use(rateLimit({ keyPrefix: "products", ...rateLimitPolicies.public }));

const listQuery = z.object({
  category: z.string().min(1).optional(),
  minPrice: z.coerce.number().int().nonnegative().optional(),
  maxPrice: z.coerce.number().int().nonnegative().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(60).default(12),
}).strict();

router.get("/", async (req, res, next) => {
  try {
    const q = listQuery.parse(req.query);
    const result = await listProducts({
      categorySlug: q.category,
      minPrice: q.minPrice,
      maxPrice: q.maxPrice,
      page: q.page,
      limit: q.limit,
    });
    res.setHeader("X-Cache", result.cached ? "HIT" : "MISS");
    res.json(result.data);
  } catch (err) {
    next(err);
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
    const result = await getProductBySlug(slug);
    res.setHeader("X-Cache", result.cached ? "HIT" : "MISS");
    res.json(result.data);
  } catch (err) {
    next(err);
  }
});

export default router;

export const categoriesRouter = (() => {
  const r = Router();
  r.use(
    rateLimit({
      keyPrefix: "categories",
      ...rateLimitPolicies.public,
    }),
  );
  r.get("/", async (_req, res, next) => {
    try {
      const result = await listCategories();
      res.setHeader("X-Cache", result.cached ? "HIT" : "MISS");
      res.json({ items: result.data });
    } catch (err) {
      next(err);
    }
  });
  return r;
})();
