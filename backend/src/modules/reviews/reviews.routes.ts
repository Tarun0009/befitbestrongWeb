import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import { rateLimit } from "../../middleware/rateLimit.js";
import { rateLimitPolicies } from "../../config/rateLimitConfig.js";
import {
  createReview,
  getReviewEligibility,
  listProductReviews,
} from "./reviews.service.js";

const router = Router();
const publicRateLimit = rateLimit({
  keyPrefix: "reviews-public",
  ...rateLimitPolicies.public,
});
const authenticatedRateLimit = rateLimit({
  keyPrefix: "reviews-authenticated",
  ...rateLimitPolicies.authenticated,
  accountKeyBy: (req) => req.auth?.userId,
});

const slugParam = z.object({
  slug: z.string().trim().min(1).max(160),
}).strict();

const pageQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(30).default(10),
}).strict();

const reviewBody = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(100).nullable().optional(),
  comment: z.string().trim().min(20).max(1000),
}).strict();

router.get("/products/:slug", publicRateLimit, async (req, res, next) => {
  try {
    const { slug } = slugParam.parse(req.params);
    const query = pageQuery.parse(req.query);
    const result = await listProductReviews(slug, query.page, query.limit);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get(
  "/products/:slug/eligibility",
  requireAuth,
  authenticatedRateLimit,
  async (req, res, next) => {
    try {
      const { slug } = slugParam.parse(req.params);
      const result = await getReviewEligibility(req.auth!.userId, slug);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/products/:slug",
  requireAuth,
  authenticatedRateLimit,
  async (req, res, next) => {
  try {
    const { slug } = slugParam.parse(req.params);
    const body = reviewBody.parse(req.body);
    const result = await createReview(req.auth!.userId, slug, body);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
  },
);

export default router;
