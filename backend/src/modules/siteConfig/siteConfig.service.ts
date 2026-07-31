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

export interface HomepageValueProp {
  mark: string;
  title: string;
  body: string;
}

export interface HomepageCategoryTile {
  tag: string;
  title: string;
  slug: string;
  imageUrl: string;
  blurb: string;
}

export interface HomepageSpotlightBullet {
  title: string;
  body: string;
}

export interface HomepageContent {
  valueProps: {
    enabled: boolean;
    items: HomepageValueProp[];
  };
  categories: {
    enabled: boolean;
    eyebrow: string;
    title: string;
    ctaLabel: string;
    ctaHref: string;
    items: HomepageCategoryTile[];
  };
  featured: {
    enabled: boolean;
    eyebrow: string;
    title: string;
    ctaLabel: string;
    ctaHref: string;
  };
  recentlyViewedEnabled: boolean;
  spotlightBullets: HomepageSpotlightBullet[];
  support: {
    enabled: boolean;
    eyebrow: string;
    title: string;
    body: string;
    cardBody: string;
    ctaLabel: string;
    ctaHref: string;
  };
}

export const DEFAULT_HOMEPAGE_CONTENT: HomepageContent = {
  valueProps: {
    enabled: true,
    items: [
      { mark: "PIN", title: "Delivery checked", body: "Confirm coverage for your six-digit PIN code." },
      { mark: "\u20B9", title: "Clear pricing", body: "Review the current price and applicable offer at checkout." },
      { mark: "STOCK", title: "Live availability", body: "Product stock is checked before an order is confirmed." },
      { mark: "ORD", title: "Order visibility", body: "Follow status and available actions from your account." },
    ],
  },
  categories: {
    enabled: true,
    eyebrow: "Shop by goal",
    title: "Built for the next session",
    ctaLabel: "All products",
    ctaHref: "/shop",
    items: [
      {
        tag: "Fuel",
        title: "Supplements",
        slug: "supplements",
        imageUrl: "https://images.unsplash.com/photo-1593095948071-474c5cc2989d?w=900",
        blurb: "Whey, creatine, pre-workout, aminos, and daily health basics.",
      },
      {
        tag: "Iron",
        title: "Equipment",
        slug: "equipment",
        imageUrl: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=900",
        blurb: "Dumbbells, kettlebells, benches, bands, and home-gym staples.",
      },
      {
        tag: "Uniform",
        title: "Apparel",
        slug: "apparel",
        imageUrl: "https://images.unsplash.com/photo-1595078475328-1ab05d0a6a0e?w=900",
        blurb: "Compression tees, shorts, joggers, and layers cut for training.",
      },
      {
        tag: "Kit",
        title: "Accessories",
        slug: "accessories",
        imageUrl: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=900",
        blurb: "Belts, wraps, straps, shakers, gloves, and the small useful stuff.",
      },
    ],
  },
  featured: {
    enabled: true,
    eyebrow: "Best sellers",
    title: "What lifters are adding to cart",
    ctaLabel: "See new drops",
    ctaHref: "/shop?sort=newest",
  },
  recentlyViewedEnabled: true,
  spotlightBullets: [
    {
      title: "No hidden blends",
      body: "Supplements favor full labels, useful dosages, and products you can compare.",
    },
    {
      title: "Home-gym ready",
      body: "Equipment is selected for compact setups, repeat use, and sensible shipping.",
    },
    {
      title: "Training-first fits",
      body: "Apparel is judged by movement, sweat, and repeat washing before the mirror.",
    },
  ],
  support: {
    enabled: true,
    eyebrow: "Customer care",
    title: "Help before and after checkout",
    body: "Find clear guidance for delivery, payments, returns, cancellations, and account access.",
    cardBody: "Need help with an order or choosing the right product?",
    ctaLabel: "Visit customer support",
    ctaHref: "/support",
  },
};

function normalizeHomepageContent(value: Prisma.JsonValue): HomepageContent {
  const stored =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Partial<HomepageContent>)
      : {};
  const valueProps = stored.valueProps;
  const categories = stored.categories;
  const featured = stored.featured;
  const support = stored.support;

  return {
    valueProps: {
      ...DEFAULT_HOMEPAGE_CONTENT.valueProps,
      ...(valueProps ?? {}),
      items: Array.isArray(valueProps?.items)
        ? valueProps.items
        : DEFAULT_HOMEPAGE_CONTENT.valueProps.items,
    },
    categories: {
      ...DEFAULT_HOMEPAGE_CONTENT.categories,
      ...(categories ?? {}),
      items: Array.isArray(categories?.items)
        ? categories.items
        : DEFAULT_HOMEPAGE_CONTENT.categories.items,
    },
    featured: {
      ...DEFAULT_HOMEPAGE_CONTENT.featured,
      ...(featured ?? {}),
    },
    recentlyViewedEnabled:
      typeof stored.recentlyViewedEnabled === "boolean"
        ? stored.recentlyViewedEnabled
        : DEFAULT_HOMEPAGE_CONTENT.recentlyViewedEnabled,
    spotlightBullets: Array.isArray(stored.spotlightBullets)
      ? stored.spotlightBullets
      : DEFAULT_HOMEPAGE_CONTENT.spotlightBullets,
    support: {
      ...DEFAULT_HOMEPAGE_CONTENT.support,
      ...(support ?? {}),
    },
  };
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
  homepage: HomepageContent;
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
        homepage: normalizeHomepageContent(cfg.homepageContent),
      };
    },
  );
}

/** Full row for the admin editor — same fields, no shaping. */
export async function getAdminSiteConfig() {
  const config = await loadOrCreate();
  return {
    ...config,
    homepageContent: normalizeHomepageContent(config.homepageContent),
  };
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
  homepageContent: HomepageContent;
}>;

export async function updateSiteConfig(patch: SiteConfigUpdate) {
  // Split out the JSON fields so we can cast them to Prisma.InputJsonValue.
  // Arrays with structural types satisfy JSON at runtime but not at the type
  // level (arrays lack the string index signature JSON expects).
  const { heroSlides, rewardTiers, homepageContent, ...rest } = patch;
  const data = {
    ...rest,
    ...(heroSlides !== undefined
      ? { heroSlides: heroSlides as unknown as Prisma.InputJsonValue }
      : {}),
    ...(rewardTiers !== undefined
      ? { rewardTiers: rewardTiers as unknown as Prisma.InputJsonValue }
      : {}),
    ...(homepageContent !== undefined
      ? { homepageContent: homepageContent as unknown as Prisma.InputJsonValue }
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

export async function updateHomepageContentSection(
  section: keyof HomepageContent,
  value: HomepageContent[keyof HomepageContent],
) {
  const updated = await prisma.$transaction(async (tx) => {
    await tx.siteConfig.upsert({
      where: { id: SITE_CONFIG_ID },
      create: { id: SITE_CONFIG_ID },
      update: {},
    });
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "SiteConfig"
      WHERE "id" = ${SITE_CONFIG_ID}
      FOR UPDATE
    `;
    const current = await tx.siteConfig.findUniqueOrThrow({
      where: { id: SITE_CONFIG_ID },
    });
    const homepageContent = {
      ...normalizeHomepageContent(current.homepageContent),
      [section]: value,
    } as HomepageContent;
    return tx.siteConfig.update({
      where: { id: SITE_CONFIG_ID },
      data: {
        homepageContent: homepageContent as unknown as Prisma.InputJsonValue,
      },
    });
  });
  await invalidateTag(SITE_CONFIG_TAG);
  return {
    ...updated,
    homepageContent: normalizeHomepageContent(updated.homepageContent),
  };
}
