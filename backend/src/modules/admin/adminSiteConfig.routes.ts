import { Router } from "express";
import { z } from "zod";
import {
  getAdminSiteConfig,
  updateSiteConfig,
} from "../siteConfig/siteConfig.service.js";
import { requireAtLeastOneField, safeHttpUrl } from "../../lib/validation.js";

import { safeNavigationHref } from '../../lib/validation.js';

const router = Router();

router.get("/site-config", async (_req, res, next) => {
  try {
    const config = await getAdminSiteConfig();
    res.json({ config });
  } catch (err) {
    next(err);
  }
});

const patchBody = requireAtLeastOneField(
  z
  .object({
    // Announcement
    announcementEnabled: z.boolean().optional(),
    announcementText: z.string().min(1).max(240).optional(),
    announcementCode: z.string().max(40).nullable().optional(),
    announcementCtaText: z.string().max(40).nullable().optional(),
    announcementCtaHref: safeNavigationHref.nullable().optional(),
    // Hero
    heroEyebrow: z.string().min(1).max(60).optional(),
    heroHeadline: z.string().min(1).max(120).optional(),
    heroHighlight: z.string().max(80).nullable().optional(),
    heroSubtitle: z.string().min(1).max(400).optional(),
    heroPrimaryLabel: z.string().min(1).max(60).optional(),
    heroPrimaryHref: safeNavigationHref,
    heroSecondaryLabel: z.string().max(60).nullable().optional(),
    heroSecondaryHref: safeNavigationHref.nullable().optional(),
    // Featured
    featuredProductIds: z.array(z.string().cuid()).max(12).optional(),
    // Multi-slide hero carousel
    heroSlides: z
      .array(
        z.object({
          eyebrow: z.string().max(60),
          headline: z.string().max(120),
          highlight: z.string().max(80).nullable().optional(),
          subtitle: z.string().max(400),
          primaryLabel: z.string().max(60),
          primaryHref: safeNavigationHref,
          secondaryLabel: z.string().max(60).nullable().optional(),
          secondaryHref: safeNavigationHref.nullable().optional(),
          imageUrl: safeHttpUrl.nullable().optional(),
        }).strict(),
      )
      .max(6)
      .optional(),
    // Reward tiers (threshold in rupees, not paise)
    rewardTiers: z
      .array(
        z.object({
          threshold: z.number().int().nonnegative(),
          reward: z.string().min(1).max(80),
        }).strict(),
      )
      .max(8)
      .optional(),
    // Spotlight
    spotlightEnabled: z.boolean().optional(),
    spotlightEyebrow: z.string().max(40).nullable().optional(),
    spotlightTitle: z.string().max(120).nullable().optional(),
    spotlightBody: z.string().max(400).nullable().optional(),
    spotlightCtaLabel: z.string().max(40).nullable().optional(),
    spotlightCtaHref: safeNavigationHref.nullable().optional(),
    })
    .strict(),
);

router.patch("/site-config", async (req, res, next) => {
  try {
    const patch = patchBody.parse(req.body);
    const config = await updateSiteConfig(patch);
    res.json({ config });
  } catch (err) {
    next(err);
  }
});

export default router;
