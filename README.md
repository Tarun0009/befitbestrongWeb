# beFitBeStrong

A depth-first full-stack gym eCommerce platform — supplements, home-gym equipment, training apparel, and accessories. The nine-phase core and all seven customer-experience extensions are shipped; the interesting bits include Redis-backed carts, Postgres full-text search, Firebase auth with server-side revocation, webhook-idempotent payments, an explicit order state machine, secure guest checkout, verified-purchase reviews, wishlists/restock demand, refund-safe loyalty accounting, stock-safe bundles, replay-safe subscription renewals, privacy-aware discovery, server-rendered product SEO, and keyboard/reduced-motion accessibility, fail-fast production configuration, and release-safe container startup.

See [`PLAN.md`](./PLAN.md) for the roadmap and [`docs/`](./docs) for design-review-shaped write-ups of each subsystem.

## Stack

- **Backend:** Node 20, Express, TypeScript, Prisma, PostgreSQL 16, Redis 7, BullMQ, Pino
- **Frontend:** Next.js 15 (App Router), Redux Toolkit + RTK Query, Tailwind, shadcn/ui
- **Auth:** Firebase Auth + `firebase-admin` + Redis revocation
- **Payment:** Razorpay (test mode) + BullMQ webhook queue
- **Infra:** Docker Compose for local services plus a production example with protected data services, one-shot migrations, health checks, and non-root app images

## Local setup

### Prerequisites
- Node.js 20+
- pnpm 10.34.5 (`corepack enable`; both package manifests pin the version)
- Docker Desktop

### Boot infra
```bash
docker compose up -d
```
Runs Postgres on `:5434` and Redis on `:6381` (non-default ports chosen to avoid clashes with other local projects).

### Backend
```bash
cd backend
cp .env.example .env
pnpm install
pnpm prisma:generate
pnpm prisma:migrate     # applies migrations + regenerates client
pnpm prisma:seed        # populates categories + ~17 products
pnpm dev                # tsx watch src/server.ts
```
API runs on `http://localhost:4000`. Verify with `GET /health/deep`.

### Frontend
```bash
cd frontend
cp .env.local.example .env.local   # fill Firebase values before Phase 2
pnpm install
pnpm dev
```
Storefront runs on `http://localhost:3005`.

### Manual setup steps
Firebase (required for auth) and Razorpay (optional — checkout works in dev mode without keys) both need external accounts. Steps in [`PENDING.md`](./PENDING.md).

### Port map
| Service   | Port |
|-----------|------|
| Frontend  | 3005 |
| Backend   | 4000 |
| Postgres  | 5434 |
| Redis     | 6381 |

## Feature depth

Each subsystem has a design-review-shaped doc under [`docs/`](./docs):

| Subsystem | Doc | The interesting bit |
|-----------|-----|---------------------|
| Architecture | [ARCHITECTURE.md](./docs/ARCHITECTURE.md) | C4 overview, request paths, cross-cutting concerns |
| Auth | [AUTH.md](./docs/AUTH.md) | Firebase + custom claims + Redis revocation set for instant force-logout |
| Caching | [CACHING.md](./docs/CACHING.md) | Tag-based Redis invalidation — writers name tags, not keys |
| Search | [SEARCH.md](./docs/SEARCH.md) | Postgres `tsvector` STORED generated column + GIN + weighted `ts_rank`; why not Elasticsearch |
| Cart | [CART.md](./docs/CART.md) | Redis hash per owner, cookie-backed guest session, atomic guest→user merge |
| Webhooks | [WEBHOOKS.md](./docs/WEBHOOKS.md) | Two-layer idempotency (Postgres UNIQUE + BullMQ `processedAt`), fast ACK |
| State machine | [ORDER_STATE_MACHINE.md](./docs/ORDER_STATE_MACHINE.md) | Whitelisted transitions, history table, refund handling |
| Reviews | [REVIEWS.md](./docs/REVIEWS.md) | Delivered-order verification, moderation, and transactionally maintained approved-only aggregates |
| Wishlist | [WISHLIST.md](./docs/WISHLIST.md) | User-isolated optimistic saves, variant restock alerts, and admin demand signals |
| Loyalty | [LOYALTY.md](./docs/LOYALTY.md) | Append-only idempotent ledger, exact refund reversals, qualified referrals, and assigned one-use reward coupons |
| Bundles + subscriptions | [BUNDLES_SUBSCRIPTIONS.md](./docs/BUNDLES_SUBSCRIPTIONS.md) | Server-authoritative bundle accounting plus replay-safe, non-charging renewal schedules |
| Discovery + accessibility | [DISCOVERY_SEO_ACCESSIBILITY.md](./docs/DISCOVERY_SEO_ACCESSIBILITY.md) | Live product SEO, private local history, explainable ranking, motion/focus/modal contracts |
| Production launch | [PRODUCTION_CONFIGURATION.md](./docs/PRODUCTION_CONFIGURATION.md) | Fail-fast environment policy, release migrations, health checks, secret handling, launch and rollback |

The API reference lives at [`docs/openapi.yaml`](./docs/openapi.yaml) — paste into `editor.swagger.io` for an interactive view, or run:
```bash
npx @redocly/cli preview-docs docs/openapi.yaml
```

## Testing

Jest + ts-jest under ESM covers pure policies; self-cleaning database smoke scripts verify cross-module lifecycle invariants.

```bash
cd backend
pnpm test
```

Covers:
- **State machine transitions.** Locks in the transition map from PLAN.md; catches stray edits that would open (or close) a status path in prod.
- **Webhook signature verification.** HMAC-SHA256 correctness, timing-safe compare, length-mismatch guard, missing-secret refusal.
- **Cache key generation.** Deterministic, key-order-independent, compact base36 output.
- **Reviews and stock-alert policies.** Locks verified-purchase and zero-to-positive notification decisions.
- **Loyalty conversion and lifecycle.** Exact redemption increments plus a self-cleaning database smoke for replay, refunds, referrals, assigned coupons, and restoration.
- **Bundle and subscription policies.** Fixed/percentage pricing, component availability, discount rounding, schedule math, and self-cleaning checkout/renewal lifecycle smokes.
- **Discovery policy.** Recently-viewed normalization/capping, deterministic related-product scoring, and explainable recommendation labels.

## Docker

Both apps have multi-stage Dockerfiles targeting a slim `node:20-alpine` runtime with non-root users:

```bash
# Fill the ignored deploy/.env.production first.
docker compose \
  --env-file deploy/.env.production \
  -f deploy/docker-compose.production.example.yml \
  up -d --build
```

Frontend uses Next.js `output: "standalone"` for a self-contained bundle. The
production Compose example runs Prisma migrations once as a release job before the
API becomes ready; API replicas never race to migrate at startup. See
[`docs/PRODUCTION_CONFIGURATION.md`](./docs/PRODUCTION_CONFIGURATION.md).

## Phase status

- [x] Phase 1 — Foundation & Scaffolding
- [x] Phase 2 — Auth System (Firebase + Redis revocation)
- [x] Phase 3 — Product Catalog + Admin CRUD
- [x] Phase 4 — Search & Filters (Postgres FTS)
- [x] Phase 5 — Cart (Redis-backed) — drawer + page + guest→user merge
- [x] Phase 6 — Checkout + Payment (Razorpay + BullMQ webhook worker)
- [x] Phase 7 — Orders + State Machine + Admin Ops
- [x] Phase 8 — Admin Panel (dashboard, product editor, orders table, categories)
- [x] Phase 9 — Polish, Docs, Deploy Prep (Dockerfiles, tests, OpenAPI, design docs)
- [x] Phase 10A — Storefront UX + Marketing CMS
- [x] Phase 10B — Guest Checkout + Coupons + Order Emails
- [x] Phase 10C — Reviews & Ratings
- [x] Phase 10D — Wishlist + Back-in-Stock Alerts
- [x] Phase 10E — Loyalty, Referrals + Retention
- [x] Phase 10F — Bundles + Subscriptions
- [x] Phase 10G — Discovery, SEO + Accessibility
- [x] Phase 11A — Production Launch Readiness
- [ ] Phase 11B — CI/CD, Backups + Observability

## Resume talking points

1. **Firebase Auth + custom claims + Redis revocation list** — server-side force-logout on top of a managed auth service, with a 60s Redis cache of the verified user to keep the hot path off Postgres.
2. **Tag-based Redis cache invalidation** — writers name tags, readers name the tags they belong to; zero coupling between mutation sites and reader shapes.
3. **Postgres FTS with weighted `tsvector` + GIN** via a STORED generated column — no trigger, no ETL, `ts_rank` weights name matches above body matches. Decision context: why not Elasticsearch.
4. **Redis-backed cart** — hash per owner (`variantId → quantity`), TTL'd per key so abandoned carts self-clean; atomic guest→user merge via `MULTI` on login.
5. **Webhook idempotency** via `WebhookEvent @@unique(provider, eventId)` — the source of truth AND the dedupe key are the same row. Second-layer `processedAt` sentinel handles BullMQ redeliveries.
6. **Stock reservation under concurrency** — `UPDATE ... WHERE stock >= qty` inside a transaction. No row locks held across the Razorpay network call.
7. **Order state machine** — every status change routes through one `transition()` function that validates against a whitelist map, writes to `OrderStatusHistory`, and runs side effects (stock release / Razorpay refund) atomically.
8. **Sliding-window rate limiting** in Redis on `/auth/*`.
9. **BullMQ payment-events queue** — decouples webhook ACK from state transition work; retries with exponential backoff.
10. **Analytics with window functions** — top-products endpoint uses `SUM(units_sold) OVER ()` to compute each product's share of top-N in one query.
11. **Refund-safe loyalty ledger** — append-only signed entries with unique idempotency keys, snapshot-based referral reversals, atomic assigned-coupon consumption, and balance restoration on abandoned orders.
12. **Bundle accounting without stock ambiguity** — Redis preserves bundle identity, checkout expands only at the reservation boundary, and orders separately snapshot retail value, bundle savings, and post-bundle coupon savings.
13. **Replay-safe subscription renewals** — a compare-and-swap schedule claim plus a unique renewal key prevents worker/admin scan races; reminders never charge or reserve stock outside checkout.
14. **Privacy-aware discovery** — the browser stores only ordered slugs/timestamps; the API rehydrates current active catalog data and explainable category/price/stock/rating recommendations.
15. **Server-rendered commerce SEO and inclusive interaction contracts** — live sitemap, Product/Offer JSON-LD, canonical/social metadata, noindex boundaries, reduced motion, focus containment, and LCP image hints.

## Layout

```
ecommerceWeb/
├── backend/
│   ├── src/
│   │   ├── config/                    # env, db, redis, logger
│   │   ├── lib/                       # cache, hash, firebase, razorpay, queue
│   │   ├── middleware/                # auth, optionalAuth, rateLimit, errorHandler, requestId
│   │   ├── modules/                   # feature modules
│   │   │   ├── auth/                  # session, revocation, /auth/me
│   │   │   ├── products/              # public catalog, cached
│   │   │   ├── search/                # Postgres FTS
│   │   │   ├── cart/                  # Redis hash per owner
│   │   │   ├── checkout/              # atomic stock reservation, Razorpay orders
│   │   │   ├── webhooks/              # raw-body HMAC verification
│   │   │   ├── orders/                # state machine + customer endpoints
│   │   │   └── admin/                 # catalog, orders, analytics, categories
│   │   ├── jobs/                      # BullMQ workers
│   │   ├── routes/                    # aggregator
│   │   ├── app.ts
│   │   └── server.ts
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── migrations/
│   │   └── seed.ts
│   ├── tests/                         # jest + ts-jest under ESM
│   ├── Dockerfile
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── app/                       # Next.js App Router
│   │   │   ├── (auth)/                # login, signup
│   │   │   ├── (shop)/                # public storefront
│   │   │   │   ├── shop/[slug]/       # product detail
│   │   │   │   ├── cart/              # cart page
│   │   │   │   └── checkout/          # + success + failure
│   │   │   ├── account/               # customer area + orders
│   │   │   └── admin/                 # role-gated admin panel
│   │   ├── components/                # Header, CartDrawer, StatusPill
│   │   ├── features/                  # slices (auth, cartUi)
│   │   └── lib/                       # RTK Query APIs, firebase, format, utils
│   ├── DESIGN.md                      # design system reference
│   ├── Dockerfile
│   └── package.json
│
├── docs/                              # design-review-shaped write-ups
│   ├── ARCHITECTURE.md
│   ├── AUTH.md
│   ├── CACHING.md
│   ├── SEARCH.md
│   ├── CART.md
│   ├── WEBHOOKS.md
│   ├── ORDER_STATE_MACHINE.md
│   ├── BUNDLES_SUBSCRIPTIONS.md
│   ├── DISCOVERY_SEO_ACCESSIBILITY.md
│   ├── PRODUCTION_CONFIGURATION.md
│   └── openapi.yaml
│
├── deploy/                            # production Compose + placeholder env template
├── docker-compose.yml                 # postgres + redis for local dev
├── PLAN.md
├── PENDING.md                         # external-account manual steps
└── README.md
```






