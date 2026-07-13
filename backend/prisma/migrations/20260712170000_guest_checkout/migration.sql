-- Phase 10B: allow checkout without a Firebase account while preserving
-- secure ownership through a hashed, high-entropy guest access token.

ALTER TABLE "Order"
  ADD COLUMN "contactEmail" TEXT,
  ADD COLUMN "guestAccessTokenHash" TEXT;

UPDATE "Order" AS orders
SET "contactEmail" = users."email"
FROM "User" AS users
WHERE orders."userId" = users."id";

ALTER TABLE "Order"
  ALTER COLUMN "contactEmail" SET NOT NULL,
  ALTER COLUMN "userId" DROP NOT NULL;

DROP INDEX IF EXISTS "Order_userId_createdAt_idx";
CREATE INDEX "Order_userId_createdAt_idx"
  ON "Order"("userId", "createdAt" DESC);
CREATE UNIQUE INDEX "Order_guestAccessTokenHash_key"
  ON "Order"("guestAccessTokenHash");

ALTER TABLE "Order" DROP CONSTRAINT "Order_userId_fkey";
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
