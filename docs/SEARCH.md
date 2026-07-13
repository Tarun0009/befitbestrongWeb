# Search — Design Review

## Problem

Storefront needs sub-100ms product search over ~40 products (with headroom for 10k+), with filters (category, price range), ranked text matching, and both offset + cursor pagination for admin tables and infinite scroll respectively. The `Reviews` table isn't in place yet, so rating filters are deferred.

## Options considered

### 1. Elasticsearch (or Meili / Typesense)

**Pros**

- Best-in-class relevance, faceting, typo tolerance, synonyms out of the box.
- Horizontal scale to millions of docs without effort.

**Cons**

- Extra service to run, monitor, back up.
- Denormalized index means dual-write consistency work (products → ES sync, either via Debezium/Outbox or app-level).
- Cost: a t3.small ES node is ~$25/mo idle. Overkill for demo-scale catalogs.
- Adds latency to writes (dual write) that pure Postgres avoids.

### 2. Postgres `LIKE` / `ILIKE` with trigram (`pg_trgm`)

**Pros**

- No new infra. Great fuzzy match.

**Cons**

- Trigram index is heavy on write and only helps prefix/substring — no linguistic ranking, no stemming.
- Ranking (`similarity()`) is lexical, not weight-aware. "cotton tee" doesn't beat "…cotton twill upper" the way FTS does.

### 3. Postgres FTS with `tsvector` + GIN index (chosen)

**Pros**

- Single service. Zero sync work. Writes stay atomic with the row they describe.
- Stemming, stop words, weighting per field, and ranking (`ts_rank`) all built in.
- `websearch_to_tsquery` accepts natural user syntax — quoted phrases, `-exclude`, `OR`, and doesn't blow up on garbage input.
- GIN index handles thousands of rows with millisecond lookups.
- Postgres 12+ **STORED generated column** removes the trigger machinery earlier tsvector recipes needed: the column is declared once, Postgres maintains it, and it can be indexed directly.

**Cons**

- Ceiling around a few million docs before write amplification / index bloat becomes real. Fine for this project's scope; migration path to ES exists if the catalog ever justifies it (index would just replay from the source of truth).
- No native typo tolerance (would need `pg_trgm` layered on top if we care).
- Single-node Postgres is a single failure domain — but the site would be down anyway if the DB were unavailable, so this doesn't change availability posture.

## Decision

Postgres FTS. The catalog is small, writes go through the same connection as reads, and one moving part beats two. The resume story is honest: "chose the simpler thing that solves the problem, with a clear escape hatch."

## Schema

```sql
ALTER TABLE "Product"
  ADD COLUMN "tsv" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("name", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("description", '')), 'B')
  ) STORED;

CREATE INDEX "Product_tsv_idx" ON "Product" USING GIN ("tsv");
```

- Name is weight A, description is weight B. `ts_rank` factors those weights in, so a query hit in the product title ranks above one that only appears in the body.
- `STORED` costs disk but means the vector is written once per row change — reads never recompute. Fewer moving parts than a trigger.

Prisma sees `tsv` as `Unsupported("tsvector")?` with a `@default(dbgenerated(...))`, so the client never tries to write to it. All FTS reads go through `$queryRaw`.

## Query

Everything runs through one raw SQL builder in `modules/search/search.service.ts`:

- **Text match:** `p.tsv @@ websearch_to_tsquery('english', $q)` (skipped when `q` is empty).
- **Rank:** `ts_rank(p.tsv, websearch_to_tsquery('english', $q))` — only computed when sort is `relevance`, otherwise the projection returns `NULL::real`.
- **Filters:** category slug (join), `basePrice` range. All filter values pass as parameters via `Prisma.sql` — the SQL string itself contains no user input.
- **Sort:** whitelisted set of `relevance | newest | price_asc | price_desc`. Never string-interpolated from the query.
- **Pagination:** offset (`page` param) or keyset (`cursor` param). Cursor encodes `{sort_value, id}` as base64url. Tiebreaker `id` direction matches the primary sort so tuple comparison works with a single operator.
- **has-more:** query fetches `limit + 1` and returns `nextCursor` if the extra row came back.

## Caching

- Search results cache in Redis under a `stableHash` of the query params with a 60s TTL.
- Tagged against `catalog:list` — the same tag product mutations already invalidate — so any admin CRUD op flushes cached search results too.
- Short TTL because: (a) cache hits are still hitting DB via revalidation soon enough; (b) filter combinations explode the key space, so we don't want stale entries hanging around.

## What's not here yet

- **Typo tolerance.** Add `pg_trgm` and `%>` similarity as a fallback when FTS returns zero results.
- **Rating filter.** Waiting on Phase 5+ once `Review` lands.
- **Autocomplete.** A separate `tsvector` over just names + prefix matching would cover it; probably deferred until it's actually a UX gap.
- **Search-as-you-type.** Header form currently submits on Enter — a `useDebounce` + live query would work but adds latency-sensitive polish that isn't on the critical path.

## Resume-ready phrases

- "Postgres FTS with weighted `tsvector` (name A / description B) via STORED generated column — no trigger, no ETL, index-scan latency."
- "Chose Postgres FTS over Elasticsearch based on scope: a second service and dual-write consistency wasn't worth it at ~40 SKUs. Migration path is clear because ES would just replay from the same source of truth."
- "Keyset (cursor) pagination on `(sort_key, id)` tuples for infinite scroll; offset pagination on the same endpoint for paged admin views."
- "SQL builder uses `Prisma.sql` parameters for all filter values and whitelisted `ORDER BY` — no user input reaches the SQL string."
