import { Router } from "express";
import { z } from "zod";
import {
  createBundle,
  deleteBundle,
  listAdminBundles,
  listBundleVariantOptions,
  updateBundle,
} from "./bundle.service.js";
import {
  requireAtLeastOneField,
  safeHttpUrl,
} from "../../lib/validation.js";

const router = Router();

const writeFields = z
  .object({
    name: z.string().trim().min(3).max(120),
    description: z.string().trim().min(10).max(1000),
    imageUrl: safeHttpUrl.nullable().optional(),
    active: z.boolean(),
    pricingType: z.enum(["FIXED_PRICE", "PERCENTAGE_OFF"]),
    value: z.number().int().positive(),
    startsAt: z.coerce.date().nullable().optional(),
    endsAt: z.coerce.date().nullable().optional(),
    items: z
      .array(
        z.object({
          variantId: z.string().cuid(),
          quantity: z.number().int().min(1).max(20),
        }).strict(),
      )
      .min(2)
      .max(20),
  })
  .strict();
const createBody = writeFields.extend({
  active: z.boolean().default(true),
});
const patchBody = requireAtLeastOneField(writeFields.partial().strict());

router.get("/bundles/options", async (_req, res, next) => {
  try {
    res.json(await listBundleVariantOptions());
  } catch (error) {
    next(error);
  }
});
router.get("/bundles", async (_req, res, next) => {
  try {
    res.json(await listAdminBundles());
  } catch (error) {
    next(error);
  }
});

router.post("/bundles", async (req, res, next) => {
  try {
    const body = createBody.parse(req.body);
    res.status(201).json(await createBundle(body));
  } catch (error) {
    next(error);
  }
});

router.patch("/bundles/:id", async (req, res, next) => {
  try {
    const id = z.string().cuid().parse(req.params.id);
    const body = patchBody.parse(req.body);
    res.json(await updateBundle(id, body));
  } catch (error) {
    next(error);
  }
});

router.delete("/bundles/:id", async (req, res, next) => {
  try {
    const id = z.string().cuid().parse(req.params.id);
    await deleteBundle(id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;
