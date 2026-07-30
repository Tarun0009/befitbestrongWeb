ALTER TABLE "ProductImage"
  ADD COLUMN "provider" VARCHAR(32),
  ADD COLUMN "storageKey" VARCHAR(255),
  ADD COLUMN "assetId" VARCHAR(255),
  ADD COLUMN "version" INTEGER,
  ADD COLUMN "width" INTEGER,
  ADD COLUMN "height" INTEGER,
  ADD COLUMN "bytes" INTEGER,
  ADD COLUMN "format" VARCHAR(20);

CREATE UNIQUE INDEX "ProductImage_provider_storageKey_key"
  ON "ProductImage"("provider", "storageKey");

ALTER TABLE "ProductImage"
  ADD CONSTRAINT "ProductImage_managed_asset_check"
  CHECK (
    (
      "provider" IS NULL AND
      "storageKey" IS NULL AND
      "assetId" IS NULL AND
      "version" IS NULL AND
      "width" IS NULL AND
      "height" IS NULL AND
      "bytes" IS NULL AND
      "format" IS NULL
    ) OR (
      "provider" = 'CLOUDINARY' AND
      "storageKey" IS NOT NULL AND
      "assetId" IS NOT NULL AND
      "version" > 0 AND
      "width" > 0 AND
      "height" > 0 AND
      "bytes" > 0 AND
      "format" IS NOT NULL
    )
  );
