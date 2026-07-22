import { Router } from "express";
import { z } from "zod";
import {
  listAdminReviews,
  moderateReview,
} from "./reviews.service.js";

const router = Router();

const reviewStatuses = ["PENDING", "APPROVED", "REJECTED"] as const;

router.get("/reviews", async (req, res, next) => {
  try {
    const query = z
      .object({
        status: z.enum(reviewStatuses).optional(),
        rating: z.coerce.number().int().min(1).max(5).optional(),
        page: z.coerce.number().int().positive().default(1),
        limit: z.coerce.number().int().positive().max(100).default(20),
      })
      .strict()
      .parse(req.query);

    const result = await listAdminReviews(query);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.patch("/reviews/:id/moderate", async (req, res, next) => {
  try {
    const id = z.string().cuid().parse(req.params.id);
    const body = z
      .object({ status: z.enum(["APPROVED", "REJECTED"]) })
      .strict()
      .parse(req.body);
    const result = await moderateReview(
      id,
      body.status,
      req.auth!.userId,
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
