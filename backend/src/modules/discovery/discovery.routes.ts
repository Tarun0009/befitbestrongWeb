import { Router } from "express";
import { z } from "zod";
import {
  listRecentlyViewedProducts,
  listRelatedProducts,
} from "./discovery.service.js";
import { normalizeRecentlyViewedSlugs } from "./discoveryPolicy.js";

const router = Router();

const recentQuery = z.object({
  slugs: z.string().max(2_000).optional().default(""),
});

router.get("/recently-viewed", async (req, res, next) => {
  try {
    const query = recentQuery.parse(req.query);
    const slugs = normalizeRecentlyViewedSlugs(query.slugs.split(","));
    const result = await listRecentlyViewedProducts(slugs);
    res.setHeader("X-Cache", result.cached ? "HIT" : "MISS");
    res.json({ items: result.data });
  } catch (error) {
    next(error);
  }
});

const relatedParams = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});
const relatedQuery = z.object({
  limit: z.coerce.number().int().min(1).max(8).default(4),
});

router.get("/related/:slug", async (req, res, next) => {
  try {
    const { slug } = relatedParams.parse(req.params);
    const { limit } = relatedQuery.parse(req.query);
    const result = await listRelatedProducts(slug, limit);
    res.setHeader("X-Cache", result.cached ? "HIT" : "MISS");
    res.json({ items: result.data });
  } catch (error) {
    next(error);
  }
});

export default router;
