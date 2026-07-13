# Caching — Design Review

## Problem

Product listing and detail endpoints are the hottest path in an eCommerce read workload. They join products with categories, images, variants — every one of those pages is dozens of joins across small tables. On a burst, that eats DB CPU that we'd rather spend on writes.

Cache the reads. But: catalog mutations (admin adds/edits a product, price change, hides an out-of-stock variant) must invalidate every cached page that included that data — a `SET status=false` shouldn't take 10 minutes to propagate because the TTL hasn't rolled over.

## Options considered

### 1. Per-key TTL only ("just cache with expiry")

**Pros**: trivial to implement.
**Cons**: stale reads until TTL elapses. Fine for prices that change once a quarter; unacceptable for a demo where admins are actively editing.

### 2. Manual invalidation on mutation

Every mutation lists the specific keys it needs to drop.

**Pros**: precise.
**Cons**: The list of "keys that touch this product" isn't obvious from the mutation site. Every new endpoint that reads products would need the mutation code updated to invalidate its shape too. Coupling that scales terribly.

### 3. Tag-based invalidation (chosen)

Every cached key registers against a **tag set**. Mutations invalidate tags, not keys — the mutation doesn't know or care which specific listing pages are cached. This is the mental model Next.js's revalidateTag, Cloudflare tag-based purge, and Fastly surrogate keys all use.

**Pros**:
- Read path names the tags it belongs to; write path names the tag it invalidates. Zero coupling between mutation site and reader shapes.
- One `SADD` per key per tag on write. One `SMEMBERS` + `DEL` pipeline per tag on invalidate — O(n) in cached keys, one round-trip.

**Cons**:
- Tag sets accumulate memory. Mitigated by an `EXPIRE` on the tag set itself (slightly longer than the longest cached key) — abandoned tags self-clean.

## Decision

Redis tag-based cache in [`lib/cache.ts`](../backend/src/lib/cache.ts). Layout:

```
cache:{key}                     ← JSON payload   (SET with EX = ttlSec)
cache:tag:{tag}                 ← SET of "cache:{key}" entries
```

## API surface

```ts
cacheGet<T>(key)                          // returns T | null
cacheSet<T>(key, value, { ttlSec, tags }) // writes payload + registers tags
cacheWrap<T>(key, ttlSec, tags, loader)   // read-through — the common shape
invalidateTag(tag)                        // pipelined DELs
invalidateTags(tags)                      // parallel invalidateTag calls
```

Callers only ever touch `cacheWrap` + `invalidateTag(s)`. The lower-level primitives exist for tests and edge cases.

## Read pattern

```ts
// listProducts (products.service.ts)
const key = `products:list:${stableHash(filters)}`;
return cacheWrap(
  key,
  600,                        // 10-minute TTL as a safety net
  [CATALOG_LIST_TAG],          // this key belongs to the catalog:list tag
  async () => { /* … prisma query … */ }
);
```

The reader:
1. `GET cache:{key}` — HIT returns immediately.
2. MISS → run the loader.
3. `SET cache:{key} <json> EX 600`
4. `SADD cache:tag:catalog:list cache:{key}`
5. `EXPIRE cache:tag:catalog:list 900` — outlives the longest cached key.

`stableHash` derives a compact base36 key from the filters object, key-order-independent (unit test covers this), so `{category:'apparel', page:1}` and `{page:1, category:'apparel'}` hit the same key.

## Write pattern

```ts
// adminCatalog.routes.ts — any mutation
await prisma.product.update({ … });
await invalidateCatalog(productId);   // drops all catalog:list keys
```

`invalidateCatalog` is a thin helper that lists the tags to drop:

```ts
export async function invalidateCatalog(productId?: string) {
  const tags = [CATALOG_LIST_TAG];
  if (productId) tags.push(productTag(productId));
  await invalidateTags(tags);
}
```

`invalidateTag('catalog:list')`:

1. `SMEMBERS cache:tag:catalog:list` → list of cached keys
2. `MULTI`
   - `DEL` each key
   - `DEL cache:tag:catalog:list` (drop the tag set itself)
3. `EXEC`

Next request hits the loader and re-populates.

## Which tags exist

- `catalog:list` — all product listing, category listing, product detail, and search-result keys. One tag because we want any product mutation to flush the entire read surface. Doesn't cost more than a hundred keys in a real workload.
- `catalog:product:{id}` — per-product tag; wired in but not yet fully exploited (currently `catalog:list` is aggressive enough). Available for finer-grained invalidation later.

Both tag sets are TTL'd (ttl + 300s) so they can't outlive the keys they reference.

## What's in cache today

| Endpoint            | Key                                | TTL   | Tags                   |
|---------------------|------------------------------------|-------|------------------------|
| `GET /products`     | `products:list:{filterHash}`       | 600s  | `catalog:list`         |
| `GET /products/:slug`| `products:detail:{slug}`          | 600s  | `catalog:list`         |
| `GET /categories`   | `categories:all`                   | 600s  | `catalog:list`         |
| `GET /search`       | `search:{filterHash}`              | 60s   | `catalog:list`         |

Search uses a shorter TTL because the params space is huge; long TTLs would balloon Redis with rarely-hit entries. Any product mutation still drops all of them.

## What's NOT cached

- **Cart** — Redis is the source of truth, not a cache. See [`CART.md`](./CART.md).
- **Orders** — user-specific, low-cardinality-per-user, not worth the complication.
- **Auth user lookups** — cached separately (`auth:user:{uid}`) with a 60s TTL, not through this system.
- **Admin analytics** — recomputed every load. Small dataset. If it grows, add a `stats:*` tag and invalidate on order transitions.

## Failure modes

- **Redis down.** `cacheGet` throws; the calling route currently propagates the error. Better UX: catch and fall through to the loader (accept the DB hit rather than 500 the user). Fix if this becomes real.
- **Loader is slow.** Concurrent MISSes race — we don't currently do request coalescing / dogpile prevention. Add a Redis-based lock (SETNX with TTL) if we ever see a thundering-herd problem.
- **Bad payload in the cache.** `cacheGet` catches JSON parse errors, logs, and drops the corrupted key. Next request repopulates.

## Testing

- [`tests/cache.test.ts`](../backend/tests/cache.test.ts) — `stableHash` determinism and key-order independence. The invalidation logic itself is an integration test we'd write with a real Redis; TODO for a future CI pass.

## Resume-ready phrases

- "Tag-based Redis cache — reads name the tags they belong to; writes name the tag to drop. Mutation sites don't know which listing shapes are cached."
- "Cache keys derived via a deterministic stable-hash of the filter object — key-order-independent so `{a:1,b:2}` and `{b:2,a:1}` share a slot."
- "Tag sets carry their own TTL slightly longer than the longest cached key — abandoned tags self-clean without a sweeper."
- "Invalidation is one round-trip: `SMEMBERS tag → MULTI DEL keys, DEL tag → EXEC`."
