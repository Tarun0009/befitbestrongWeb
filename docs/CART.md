# Cart — Design Review

## Problem

The cart is on the write-heavy hot path — every "Add to cart", every quantity nudge, every optimistic update reads and writes it. It also needs to work for anonymous browsers before they sign up, then transparently merge into their user cart when they do. A cart is inherently stale (prices, stock change) so we don't want it living in the source-of-truth table permanently.

## Options considered

### 1. Cart in Postgres (`Cart`, `CartItem` tables)

**Pros**

- Familiar. Transactional. Same backup story as everything else.

**Cons**

- Row-per-item writes on every quantity click. Wasted IOPS for state that's basically a scratchpad.
- Guest carts become long-lived rows keyed by session — someone has to sweep them.
- Latency: ~20ms Postgres round-trip for what is effectively an in-memory data structure.

### 2. Cart in `localStorage` only

**Pros**

- Zero backend cost.
- Instant.

**Cons**

- Can't merge across devices.
- Can't validate stock server-side without a full round-trip on every render.
- Doesn't survive a browser reset.

### 3. Cart in Redis, hash per owner (chosen)

**Pros**

- ~1ms reads/writes. Ideal for the click-heavy nature of cart interactions.
- Hash layout (`variantId → quantity`) matches the shape of the data and lets us HGET/HSET/HDEL surgically.
- TTL on the whole key: abandoned carts vanish after 30 days without a sweeper. Every write bumps the TTL.
- Ephemeral by design — matches how carts actually behave. Nothing to sync back to Postgres until checkout.
- Merging guest → user is a single HGETALL + HSET pipeline; no schema migration story.

**Cons**

- Not durable in the way Postgres is — if Redis loses data, carts are lost. That's acceptable: carts aren't orders, and losing an unfinished cart is a strictly better failure mode than double-charging a customer.
- Needs a separate identity story for guests (see cookie section).

## Decision

Redis hash per owner. Two key namespaces:

- `cart:user:{userId}` — the authoritative cart once someone signs in.
- `cart:guest:{sessionId}` — pre-signup carts, keyed by a cookie.

The `Cart` line in the data model comment of `PLAN.md` doesn't map to a table; it's a documented Redis shape.

## Ownership resolution

Every cart route runs through `optionalAuth`, then `resolveOwner`:

1. If the request has a valid Firebase ID token → owner is `{type: "user", id: userId}`.
2. Otherwise, look at the `cart_sid` cookie. If present, owner is `{type: "guest", id: sid}`.
3. Otherwise, mint a UUID, set the cookie, use it going forward.

The cookie is `HttpOnly`, `SameSite=Lax`, 30-day `Max-Age`, `Secure` only in production. `localhost:3005` (frontend) and `localhost:4000` (backend) are same-site so Lax cookies flow on the cross-origin fetch as long as `credentials: "include"` is set on the client — which `cartApi.ts` does.

## Stock handling

The plan is explicit: **check stock on read, don't reserve.** Reservation happens at checkout (Phase 6). Read-time behavior:

- `addItem` / `setItemQty` cap quantity at current `variant.stock` before writing to Redis. Response includes the effective quantity so the client can show a "we only had 3 left" hint.
- `getCart` re-checks stock at hydration time. If a variant was reduced below the stored quantity (an admin lowered stock while it sat in someone's cart), we clamp the stored value down and add a `notice` to the response so the UI can surface it.
- Deleted / deactivated products are pruned from the hash automatically on next read.

That "self-heal on read" pattern keeps the hot path cheap: no cross-service consistency work, no expiring-cache dance — the source of truth is the DB, and every cart read is guaranteed to reflect it.

## Merge on login

`AuthBridge` calls `POST /cart/merge` right after the `/auth/session` sync fires. Backend:

1. HGETALL the guest hash.
2. HGETALL the user hash.
3. Sum quantities per variant.
4. Cap each merged qty at current stock.
5. Rewrite the user hash in a MULTI (`DEL user; HSET user ...; EXPIRE`), then `DEL guest`.
6. Clear the `cart_sid` cookie.

Everything runs in one pipeline, so a merge is one round-trip. Idempotent — if the guest cookie is missing or the guest cart is empty, the endpoint just returns the current user cart untouched.

## Frontend optimistic updates

`cartApi` uses RTK Query's `onQueryStarted` on every mutation to patch the cached `getCart` result before the server responds. On success the response replaces the optimistic patch; on failure `patch.undo()` reverts. The header badge and the cart line quantities feel instant even on slow networks, without letting the UI diverge if the server rejects.

## What's not here yet

- **Cross-tab sync.** If a user has the cart open in two tabs, the second tab won't see changes made in the first until it refetches. RTK Query has `pollingInterval` or we could add a Redis pub/sub channel + a small SSE endpoint — probably not worth it until it's a real complaint.
- **Reservation on cart entry.** Some stores hold stock the moment it's in a cart. We deliberately don't; the checkout `SELECT ... FOR UPDATE` handles the concurrency in Phase 6.
- **Guest cart migration on cross-device sign-in.** Not applicable: the guest cart is tied to the browser cookie, so the user only "loses" what a different device would never have seen anyway.

## Resume-ready phrases

- "Cart lives in Redis as one hash per owner (`variantId → quantity`), TTL'd per key so abandoned carts self-clean without a sweeper."
- "Guest → user cart merge on login: HGETALL both sides, sum, clamp at current stock, atomic replace via `MULTI`. Cookie is `HttpOnly, SameSite=Lax`."
- "Stock is *checked* at read/write time and *reserved* at checkout — cart hydration is self-healing when stock or product status drifts."
- "Optimistic updates via RTK Query's `onQueryStarted`: mutation patches the cached cart pre-response and the server response replaces or reverts."
