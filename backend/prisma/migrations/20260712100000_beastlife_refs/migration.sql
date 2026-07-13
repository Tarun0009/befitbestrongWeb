-- Product: MRP strike-through + dispatch microcopy for the enhanced card.
ALTER TABLE "Product"
  ADD COLUMN "compareAtPrice" INTEGER,
  ADD COLUMN "dispatchHint" TEXT;

-- SiteConfig: multi-slide hero + rewards tier ladder for the ticker.
ALTER TABLE "SiteConfig"
  ADD COLUMN "heroSlides"  JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "rewardTiers" JSONB NOT NULL DEFAULT '[]';

-- Backfill a sensible default rewards ladder so the ticker isn't empty on
-- first paint (admin can edit or delete via the panel).
UPDATE "SiteConfig"
   SET "rewardTiers" = '[
     { "threshold": 999,  "reward": "Free shaker bottle" },
     { "threshold": 1999, "reward": "Free wrist wraps" },
     { "threshold": 3999, "reward": "Free lifting straps" },
     { "threshold": 5999, "reward": "Free gym duffel bag" }
   ]'::jsonb
 WHERE id = 'main' AND jsonb_array_length("rewardTiers") = 0;
