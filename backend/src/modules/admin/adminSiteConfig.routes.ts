import { Router } from "express";
import { z } from "zod";
import {
  getAdminSiteConfig,
  updateHomepageContentSection,
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

const homepageContentSchema = z
  .object({
    valueProps: z
      .object({
        enabled: z.boolean(),
        items: z
          .array(
            z
              .object({
                mark: z.string().trim().min(1).max(12),
                title: z.string().trim().min(1).max(80),
                body: z.string().trim().min(1).max(240),
              })
              .strict(),
          )
          .max(6),
      })
      .strict(),
    categories: z
      .object({
        enabled: z.boolean(),
        eyebrow: z.string().trim().min(1).max(60),
        title: z.string().trim().min(1).max(120),
        ctaLabel: z.string().trim().min(1).max(60),
        ctaHref: safeNavigationHref,
        items: z
          .array(
            z
              .object({
                tag: z.string().trim().min(1).max(40),
                title: z.string().trim().min(1).max(80),
                slug: z
                  .string()
                  .trim()
                  .min(1)
                  .max(80)
                  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
                imageUrl: safeHttpUrl,
                blurb: z.string().trim().min(1).max(240),
              })
              .strict(),
          )
          .max(8),
      })
      .strict(),
    featured: z
      .object({
        enabled: z.boolean(),
        eyebrow: z.string().trim().min(1).max(60),
        title: z.string().trim().min(1).max(120),
        ctaLabel: z.string().trim().min(1).max(60),
        ctaHref: safeNavigationHref,
      })
      .strict(),
    recentlyViewedEnabled: z.boolean(),
    spotlightBullets: z
      .array(
        z
          .object({
            title: z.string().trim().min(1).max(100),
            body: z.string().trim().min(1).max(240),
          })
          .strict(),
      )
      .max(6),
    support: z
      .object({
        enabled: z.boolean(),
        eyebrow: z.string().trim().min(1).max(60),
        title: z.string().trim().min(1).max(120),
        body: z.string().trim().min(1).max(400),
        cardBody: z.string().trim().min(1).max(240),
        ctaLabel: z.string().trim().min(1).max(60),
        ctaHref: safeNavigationHref,
      })
      .strict(),
  })
  .strict();

const homepageSectionParam = z
  .object({
    section: z.enum([
      "valueProps",
      "categories",
      "featured",
      "recentlyViewedEnabled",
      "spotlightBullets",
      "support",
    ]),
  })
  .strict();
const homepageSectionSchemas = {
  valueProps: homepageContentSchema.shape.valueProps,
  categories: homepageContentSchema.shape.categories,
  featured: homepageContentSchema.shape.featured,
  recentlyViewedEnabled: homepageContentSchema.shape.recentlyViewedEnabled,
  spotlightBullets: homepageContentSchema.shape.spotlightBullets,
  support: homepageContentSchema.shape.support,
};

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
    heroPrimaryHref: safeNavigationHref.optional(),
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
    homepageContent: homepageContentSchema.optional(),
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

router.patch("/site-config/homepage/:section", async (req, res, next) => {
  try {
    const { section } = homepageSectionParam.parse(req.params);
    const request = z.object({ value: z.unknown() }).strict().parse(req.body);
    const value = homepageSectionSchemas[section].parse(request.value);
    const config = await updateHomepageContentSection(section, value);
    res.json({ config });
  } catch (err) {
    next(err);
  }
});

export default router;
