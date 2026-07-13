import { Router } from "express";
import { z } from "zod";
import {
  getPublicBundle,
  listPublicBundles,
} from "./bundle.service.js";

const router = Router();

router.get("/", async (_req, res, next) => {
  try {
    res.json(await listPublicBundles());
  } catch (error) {
    next(error);
  }
});

router.get("/:slug", async (req, res, next) => {
  try {
    const slug = z.string().trim().min(1).max(160).parse(req.params.slug);
    res.json(await getPublicBundle(slug));
  } catch (error) {
    next(error);
  }
});

export default router;