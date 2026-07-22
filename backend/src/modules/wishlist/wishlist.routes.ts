import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import { rateLimit } from "../../middleware/rateLimit.js";
import { rateLimitPolicies } from "../../config/rateLimitConfig.js";
import {
  addWishlistItem,
  listWishlist,
  removeWishlistItem,
} from "./wishlist.service.js";

const router = Router();
router.use(
  requireAuth,
  rateLimit({
    keyPrefix: "wishlist",
    ...rateLimitPolicies.authenticated,
    accountKeyBy: (req) => req.auth?.userId,
  }),
);

router.get("/", async (req, res, next) => {
  try {
    const result = await listWishlist(req.auth!.userId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/:productId", async (req, res, next) => {
  try {
    const productId = z.string().cuid().parse(req.params.productId);
    const result = await addWishlistItem(req.auth!.userId, productId);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.delete("/:productId", async (req, res, next) => {
  try {
    const productId = z.string().cuid().parse(req.params.productId);
    await removeWishlistItem(req.auth!.userId, productId);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;
