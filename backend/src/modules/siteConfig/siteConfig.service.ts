import { Prisma } from "@prisma/client";
import { prisma } from "../../config/db.js";
import { cacheWrap, invalidateTag } from "../../lib/cache.js";

/**
 * Site config (aka "CMS lite") — one singleton row keyed at id="main".
 * Consumed by the public homepage + announcement bar. Editable from the
 * admin panel. Cached in Redis with its own tag so admin edits invalidate
 * all consumers in one round-trip.
 */

const SITE_CONFIG_ID = "main";
export const SITE_CONFIG_TAG = "site:config";
const TTL_SEC = 600;

export interface HeroSlide {
  eyebrow: string;
  headline: string;
  highlight?: string | null;
  subtitle: string;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel?: string | null;
  secondaryHref?: string | null;
  imageUrl?: string | null;
}

export interface RewardTier {
  threshold: number; // rupees (not paise) — matches admin UI + storefront ticker
  reward: string;
}

export interface PublicSiteConfig {
  announcement: {
    enabled: boolean;
    text: string;
    code: string | null;
    ctaText: string | null;
    ctaHref: string | null;
  };
  hero: {
    eyebrow: string;
    headline: string;
    highlight: string | null;
    subtitle: string;
    primary: { label: string; href: string };
    secondary: { label: string; href: string } | null;
  };
  heroSlides: HeroSlide[];
  rewardTiers: RewardTier[];
  featuredProductIds: string[];
  spotlight: {
    enabled: boolean;
    eyebrow: string | null;
    title: string | null;
    body: string | null;
    ctaLabel: string | null;
    ctaHref: string | null;
  };
}

async function loadOrCreate() {
  const existing = await prisma.siteConfig.findUnique({
    where: { id: SITE_CONFIG_ID },
  });
  if (existing) return existing;
  return prisma.siteConfig.create({
    data: { id: SITE_CONFIG_ID },
  });
}

export async function getPublicSiteConfig() {
  return cacheWrap<PublicSiteConfig>(
    "site:config:public",
    TTL_SEC,
    [SITE_CONFIG_TAG],
    async () => {
      const cfg = await loadOrCreate();
      return {
        announcement: {
          enabled: cfg.announcementEnabled,
          text: cfg.announcementText,
          code: cfg.announcementCode,
          ctaText: cfg.announcementCtaText,
          ctaHref: cfg.announcementCtaHref,
        },
        hero: {
          eyebrow: cfg.heroEyebrow,
          headline: cfg.heroHeadline,
          highlight: cfg.heroHighlight,
          subtitle: cfg.heroSubtitle,
          primary: {
            label: cfg.heroPrimaryLabel,
            href: cfg.heroPrimaryHref,
          },
          secondary:
            cfg.heroSecondaryLabel && cfg.heroSecondaryHref
              ? {
                  label: cfg.heroSecondaryLabel,
                  href: cfg.heroSecondaryHref,
                }
              : null,
        },
        heroSlides: (cfg.heroSlides as unknown as HeroSlide[]) ?? [],
        rewardTiers: (cfg.rewardTiers as unknown as RewardTier[]) ?? [],
        featuredProductIds: cfg.featuredProductIds,
        spotlight: {
          enabled: cfg.spotlightEnabled,
          eyebrow: cfg.spotlightEyebrow,
          title: cfg.spotlightTitle,
          body: cfg.spotlightBody,
          ctaLabel: cfg.spotlightCtaLabel,
          ctaHref: cfg.spotlightCtaHref,
        },
      };
    },
  );
}

/** Full row for the admin editor — same fields, no shaping. */
export async function getAdminSiteConfig() {
  return loadOrCreate();
}

export type SiteConfigUpdate = Partial<{
  announcementEnabled: boolean;
  announcementText: string;
  announcementCode: string | null;
  announcementCtaText: string | null;
  announcementCtaHref: string | null;
  heroEyebrow: string;
  heroHeadline: string;
  heroHighlight: string | null;
  heroSubtitle: string;
  heroPrimaryLabel: string;
  heroPrimaryHref: string;
  heroSecondaryLabel: string | null;
  heroSecondaryHref: string | null;
  featuredProductIds: string[];
  heroSlides: HeroSlide[];
  rewardTiers: RewardTier[];
  spotlightEnabled: boolean;
  spotlightEyebrow: string | null;
  spotlightTitle: string | null;
  spotlightBody: string | null;
  spotlightCtaLabel: string | null;
  spotlightCtaHref: string | null;
}>;

export async function updateSiteConfig(patch: SiteConfigUpdate) {
  // Split out the JSON fields so we can cast them to Prisma.InputJsonValue.
  // Arrays with structural types satisfy JSON at runtime but not at the type
  // level (arrays lack the string index signature JSON expects).
  const { heroSlides, rewardTiers, ...rest } = patch;
  const data = {
    ...rest,
    ...(heroSlides !== undefined
      ? { heroSlides: heroSlides as unknown as Prisma.InputJsonValue }
      : {}),
    ...(rewardTiers !== undefined
      ? { rewardTiers: rewardTiers as unknown as Prisma.InputJsonValue }
      : {}),
  };
  const updated = await prisma.siteConfig.upsert({
    where: { id: SITE_CONFIG_ID },
    create: { id: SITE_CONFIG_ID, ...data },
    update: data,
  });
  await invalidateTag(SITE_CONFIG_TAG);
  return updated;
}
