-- SiteConfig — singleton table for admin-editable homepage + announcement content.

CREATE TABLE "SiteConfig" (
    "id" TEXT NOT NULL DEFAULT 'main',

    -- Announcement bar
    "announcementEnabled" BOOLEAN NOT NULL DEFAULT true,
    "announcementText" TEXT NOT NULL DEFAULT 'Free shipping on orders over ₹999',
    "announcementCode" TEXT,
    "announcementCtaText" TEXT DEFAULT 'Shop now',
    "announcementCtaHref" TEXT DEFAULT '/shop',

    -- Hero
    "heroEyebrow" TEXT NOT NULL DEFAULT 'beFitBeStrong',
    "heroHeadline" TEXT NOT NULL DEFAULT 'Kit for the work.',
    "heroHighlight" TEXT DEFAULT 'No filler.',
    "heroSubtitle" TEXT NOT NULL DEFAULT 'Supplements, home-gym equipment, apparel, and accessories — curated for people who train.',
    "heroPrimaryLabel" TEXT NOT NULL DEFAULT 'Shop the range →',
    "heroPrimaryHref" TEXT NOT NULL DEFAULT '/shop',
    "heroSecondaryLabel" TEXT DEFAULT 'Browse supplements',
    "heroSecondaryHref" TEXT DEFAULT '/shop?category=supplements',

    -- Featured products (ordered array of Product ids).
    "featuredProductIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

    -- Spotlight section
    "spotlightEnabled" BOOLEAN NOT NULL DEFAULT true,
    "spotlightEyebrow" TEXT DEFAULT 'New in',
    "spotlightTitle" TEXT DEFAULT 'Certified. Tested. Real dosing.',
    "spotlightBody" TEXT DEFAULT 'Every supplement we stock lists its third-party testing. We won''t sell proprietary blends or hidden dosages.',
    "spotlightCtaLabel" TEXT DEFAULT 'Shop supplements',
    "spotlightCtaHref" TEXT DEFAULT '/shop?category=supplements',

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteConfig_pkey" PRIMARY KEY ("id")
);

-- Seed the singleton row so /site-config returns defaults on the first request.
INSERT INTO "SiteConfig" ("id", "updatedAt") VALUES ('main', CURRENT_TIMESTAMP)
    ON CONFLICT ("id") DO NOTHING;
