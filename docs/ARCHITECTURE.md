# Architecture — System Overview

A depth-first eCommerce build split into a Next.js storefront + admin, an Express API, and stateful infra (Postgres + Redis). Nine phases in [`PLAN.md`](../PLAN.md); this doc is the C4-style overview stitching them together.

---

## Level 1 — System Context

```
                   ┌─────────────────┐
                   │   Customer      │
                   └────────┬────────┘
                            │ HTTPS
                            ▼
                   ┌─────────────────────┐
                   │  Next.js frontend   │  (:3005)
                   │  storefront + admin │
                   └────────┬────────────┘
                            │ REST / JSON + cookies
                            ▼
              ┌────────────────────────────┐
              │      Express API           │  (:4000)
              │    Node 20 + TypeScript    │
              └────┬──────────┬─────────┬──┘
                   │          │         │
     ┌─────────────▼──┐  ┌────▼────┐  ┌─▼──────────────┐
     │  PostgreSQL 16 │  │  Redis  │  │ Firebase Admin │
     │  (Prisma ORM)  │  │   7     │  │  Google Cloud  │
     └────────────────┘  └────┬────┘  └────────────────┘
                              │
                       ┌──────▼──────┐
                       │  BullMQ     │  worker in-process
                       │payment-events│
                       └──────┬──────┘
                              │
                              ▼
                       ┌──────────────┐
                       │  Razorpay    │  webhook + refunds
                       │  (test mode) │
                       └──────────────┘
```

**External systems**

- **Firebase Auth** — owns credentials. We only verify ID tokens.
- **Razorpay** — payment gateway. We create orders + refunds, receive webhooks.

**Owned services**

- **Next.js** — SSR shell + client components. State: Redux Toolkit + RTK Query.
- **Express API** — HTTP + BullMQ worker in the same process (Phase 9 could split them).
- **Postgres** — source of truth for users, catalog, orders, webhook audit log.
- **Redis** — cart storage, session cache, revocation set, tag-based cache, BullMQ backing store.

---

## Level 2 — Containers

```
┌──────────────────────────────────────────────────────────────────────┐
│                       Next.js (App Router)                           │
│                                                                      │
│  (shop)/            (auth)/          account/       admin/            │
│  ├ /                 ├ /login         ├ /            ├ /               │
│  ├ /shop             └ /signup        ├ /orders      ├ /products       │
│  ├ /shop/[slug]                       └ /orders/[id] ├ /categories     │
│  ├ /cart                                             └ /orders         │
│  └ /checkout                                                            │
│                                                                        │
│  Redux slices:  auth, cartUi                                           │
│  RTK Query APIs: authApi, catalogApi, cartApi, ordersApi,              │
│                  adminAnalyticsApi                                     │
└──────────────────────────────────────────────────────────────────────┘
                                │
                                │ fetch() with Firebase ID token + cart cookie
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        Express API                                    │
│                                                                       │
│  middleware/                    modules/                              │
│  ├ requestId (Pino child)       ├ auth/         (session, revocation) │
│  ├ requireAuth                  ├ products/     (public catalog)      │
│  ├ optionalAuth                 ├ search/       (Postgres FTS)        │
│  ├ requireRole('ADMIN')         ├ cart/         (Redis hashes)        │
│  ├ rateLimit (Redis)            ├ checkout/     (Razorpay orders)     │
│  └ errorHandler (typed)         ├ webhooks/     (raw body, HMAC)      │
│                                 ├ orders/       (state machine)       │
│                                 └ admin/                              │
│                                    ├ adminCatalog                     │
│                                    ├ adminOrders                      │
│                                    └ adminAnalytics                   │
│                                                                       │
│  lib/                           jobs/                                 │
│  ├ cache (tag invalidation)     └ paymentEvents (BullMQ worker)       │
│  ├ hash (stableHash)                                                  │
│  ├ firebase (admin SDK)                                               │
│  ├ razorpay (REST client)                                             │
│  └ queue (BullMQ)                                                     │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Level 3 — Request paths that matter

### Add to cart (guest)

```
Browser ──POST /cart/items── Express
                                │
                                ├── optionalAuth: no token → skip
                                ├── resolveOwner: no cookie → mint UUID,
                                │                  set Set-Cookie: cart_sid=…
                                │
                                ├── prisma.productVariant.findUnique (stock)
                                └── redis.HSET cart:guest:{sid} variantId qty
                                    redis.EXPIRE cart:guest:{sid} 30d
```

### Checkout (signed in)

```
Browser ──POST /checkout/session── Express
                                     │
        ┌────────────────────────────┤
        │ prisma.$transaction:       │
        │   for each cart line:      │
        │     UPDATE variant         │
        │       SET stock = stock-q  │
        │       WHERE stock >= q     │  ← atomic conditional decrement
        │   INSERT Order (PENDING)   │
        │   INSERT OrderItem[]       │
        │   INSERT OrderStatusHistory│
        └────────────────────────────┘
                                     │
        ┌────────────────────────────┤
        │ fetch(razorpay.com)        │  ← outside DB tx, no locks held
        │   POST /v1/orders          │
        └────────────────────────────┘
                                     │
        ┌────────────────────────────┤
        │ prisma.$transaction:       │
        │   UPDATE Order.providerOrderId = rzp.id
        │   INSERT Payment (CREATED) │
        └────────────────────────────┘
                                     │
                                     └── redis.DEL cart:user:{userId}
                                     └── res: { orderId, razorpay: {…} }
```

### Webhook (payment.captured)

```
Razorpay ──POST /webhooks/razorpay── Express
                                       │
                                       ├── express.raw() captures Buffer
                                       ├── HMAC-SHA256 verify (timingSafeEqual)
                                       │
                                       ├── INSERT WebhookEvent (…, eventId)
                                       │       │
                                       │       └── UNIQUE(provider, eventId)
                                       │           P2002 → 200 { deduped }
                                       │
                                       ├── paymentEventsQueue.add(jobId=eventId)
                                       └── res 200 { received: true }

Worker (in-process) picks up job
                    │
                    ├── SELECT WebhookEvent WHERE id = job.data
                    ├── if processedAt: return  (2nd-layer dedupe)
                    │
                    └── transition(prisma, orderId, PAID, { actor: 'system' })
                          │
                          ├── validate map (PENDING → PAID allowed)
                          ├── prisma.$transaction:
                          │     UPDATE Order.status = PAID
                          │     UPDATE Payment.status = CAPTURED
                          │     INSERT OrderStatusHistory
                          │
                          └── UPDATE WebhookEvent.processedAt = now()
```

---

## Data model at a glance

```
User ──┬─< Address
       └─< Order ──┬─< OrderItem
                   ├─< OrderStatusHistory
                   └── Payment
Category (self-referencing) ──< Product ──┬─< ProductVariant
                                          └─< ProductImage
WebhookEvent  (standalone, UNIQUE provider+eventId)
```

Everything that touches money (Order, OrderItem, Payment, WebhookEvent) is snapshot-preserving — orders keep the `productSnapshot` JSON and `addressSnapshot` JSON so downstream changes to the catalog or user's saved address don't rewrite history.

---

## Cross-cutting concerns

- **Auth** — Firebase Web SDK on the client → server verifies ID token via `firebase-admin` → 60s Redis cache of the decoded user → Redis revocation set for instant force-logout. See [`AUTH.md`](./AUTH.md).
- **Caching** — Redis with tag sets. Mutations enumerate tags to invalidate (`invalidateCatalog(productId)`); listing endpoints register the tags they belong to. See [`CACHING.md`](./CACHING.md).
- **Rate limiting** — sliding-window in Redis, keyed by IP, applied to `/auth/*`.
- **Idempotency** — `WebhookEvent @@unique(provider, eventId)` + BullMQ `jobId` + `processedAt` sentinel. See [`WEBHOOKS.md`](./WEBHOOKS.md).
- **Stock safety** — atomic `UPDATE ... WHERE stock >= qty` inside a transaction. State machine handles releases on cancel/fail/refund. See [`ORDER_STATE_MACHINE.md`](./ORDER_STATE_MACHINE.md).
- **Search** — Postgres `tsvector` STORED generated column + GIN index, ranked with `ts_rank`. See [`SEARCH.md`](./SEARCH.md).
- **Cart** — Redis hash per owner, cookie-backed guest sessions, atomic guest→user merge on login. See [`CART.md`](./CART.md).
- **Observability** — Pino JSON logs, one line per request with `requestId` propagated through the child logger. Structured errors returned via `HttpError`.

---

## Deploy topology (target)

```
Cloudflare ── vercel (Next.js) ─┐
                                │
Cloudflare ── Fly.io / Railway ─┤ ── Express + BullMQ worker  ── Neon (Postgres)
                                │                              \─ Upstash (Redis)
                                └── Razorpay webhook path
```

Docker images provided for both backend and frontend (Dockerfiles in each dir). The BullMQ worker is co-located with the API for now; splitting it into its own container is a one-file change (`server.ts` boots the worker; extract to `worker.ts` with its own entrypoint).
