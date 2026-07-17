import { Router } from "express";
import { z } from "zod";
import {
  createSubscriptionPlan,
  deleteSubscriptionPlan,
  getAdminSubscriptionSummary,
  processDueSubscriptions,
  updateSubscriptionPlan,
} from "./subscription.service.js";
import { requireAtLeastOneField } from "../../lib/validation.js";

const router = Router();
const frequencies = z.array(z.number().int().min(7).max(365)).min(1).max(6);
const createBody = z.object({
  name: z.string().trim().min(3).max(120),
  variantId: z.string().cuid(),
  discountPercent: z.number().int().min(1).max(50),
  allowedFrequencies: frequencies,
  active: z.boolean().default(true),
});
const updateBody = createBody.omit({ variantId: true });
const updatePatchBody = requireAtLeastOneField(updateBody.partial().strict());

router.get("/subscriptions", async (_req, res, next) => {
  try {
    res.json(await getAdminSubscriptionSummary());
  } catch (error) {
    next(error);
  }
});

router.post("/subscription-plans", async (req, res, next) => {
  try {
    res.status(201).json(await createSubscriptionPlan(createBody.parse(req.body)));
  } catch (error) {
    next(error);
  }
});

router.put("/subscription-plans/:id", async (req, res, next) => {
  try {
    const id = z.string().cuid().parse(req.params.id);
    res.json(await updateSubscriptionPlan(id, updateBody.parse(req.body)));
  } catch (error) {
    next(error);
  }
});

router.patch("/subscription-plans/:id", async (req, res, next) => {
  try {
    const id = z.string().cuid().parse(req.params.id);
    res.json(await updateSubscriptionPlan(id, updatePatchBody.parse(req.body)));
  } catch (error) {
    next(error);
  }
});

router.delete("/subscription-plans/:id", async (req, res, next) => {
  try {
    const id = z.string().cuid().parse(req.params.id);
    await deleteSubscriptionPlan(id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.post("/subscriptions/process-due", async (_req, res, next) => {
  try {
    res.json(await processDueSubscriptions());
  } catch (error) {
    next(error);
  }
});

export default router;