import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import { rateLimit } from "../../middleware/rateLimit.js";
import {
  controlSubscription,
  enrollSubscription,
  listUserSubscriptions,
} from "./subscription.service.js";

const router = Router();
router.use(rateLimit({ keyPrefix: "subscriptions", max: 60, windowSec: 60 }));
router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    res.json(await listUserSubscriptions(req.auth!.userId));
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const body = z.object({
      planId: z.string().cuid(),
      orderId: z.string().cuid(),
      quantity: z.number().int().min(1).max(20).default(1),
      frequencyDays: z.number().int().min(7).max(365),
    }).parse(req.body);
    res.status(201).json(
      await enrollSubscription(req.auth!.userId, body),
    );
  } catch (error) {
    next(error);
  }
});

router.post("/:id/:action", async (req, res, next) => {
  try {
    const id = z.string().cuid().parse(req.params.id);
    const action = z.enum(["pause", "resume", "skip", "cancel"]).parse(req.params.action);
    const subscription = await controlSubscription(
      req.auth!.userId,
      id,
      action,
    );
    res.json({ subscription });
  } catch (error) {
    next(error);
  }
});

export default router;