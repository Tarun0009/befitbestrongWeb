-- Phase 4: Postgres full-text search on Product (name + description).
--
-- Uses a STORED generated column so Postgres maintains tsv automatically on
-- every insert/update — no trigger to keep in sync, and the column can be
-- indexed directly with GIN.
--
-- Weighting: name = A (highest), description = B. ts_rank uses these weights
-- when the query ranks results (so name matches beat body-only matches).

ALTER TABLE "Product"
  ADD COLUMN "tsv" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("name", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("description", '')), 'B')
  ) STORED;

CREATE INDEX "Product_tsv_idx" ON "Product" USING GIN ("tsv");
