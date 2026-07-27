-- Add admin-managed homepage merchandising content while keeping existing
-- storefronts compatible through service-level defaults.
ALTER TABLE "SiteConfig"
ADD COLUMN "homepageContent" JSONB NOT NULL DEFAULT '{}'::jsonb;
