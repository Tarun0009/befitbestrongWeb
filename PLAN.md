# beFitBeStrong — Full-Stack Gym eCommerce Platform

**Goal:** Ship a production-grade eCommerce platform with strong engineering depth in caching, auth, search, payment webhooks, and order state management. Portfolio + resume project targeting mid/senior backend interviews.

---

## Tech Stack

### Backend
- **Runtime:** Node.js 20 + TypeScript (strict mode)
- **Framework:** Express.js (feature-based folder structure)
- **Database:** PostgreSQL 16 + Prisma ORM
- **Cache/Queue:** Redis 7 (ioredis client) + BullMQ (webhook queue)
- **Auth:** Firebase Auth (client SDK) + `firebase-admin` on backend for ID token verification. Custom claims for role. Redis-backed revocation list for server-side force-logout. Zod for request validation.
- **Payment:** Razorpay (test mode) — primary; Stripe abstraction for portability
- **Logging:** Pino (JSON structured logs)
- **API Docs:** Swagger / OpenAPI 3
- **Testing:** Jest + Supertest for critical flows

### Frontend
- **Framework:** Next.js 15 (App Router) + TypeScript
- **State:** Redux Toolkit + RTK Query
- **Styling:** Tailwind CSS + shadcn/ui
- **Forms:** React Hook Form + Zod
- **HTTP:** Native fetch via RTK Query

### Infra / DevX
- **Local dev:** Docker Compose (Postgres + Redis)
- **Env management:** dotenv + zod-validated env schema
- **Package manager:** pnpm

---

## Repository Layout

```
ecommerceWeb/
├── backend/                    # Express API
│   ├── src/
│   │   ├── config/             # env, db, redis, logger
│   │   ├── modules/            # feature-based modules
│   │   │   ├── auth/
│   │   │   ├── users/
│   │   │   ├── products/
│   │   │   ├── categories/
│   │   │   ├── search/
│   │   │   ├── cart/
│   │   │   ├── checkout/
│   │   │   ├── orders/
│   │   │   ├── payments/
│   │   │   └── admin/
│   │   ├── middleware/         # auth, rateLimit, errorHandler, requestId
│   │   ├── lib/                # jwt, cache, queue, validators
│   │   ├── jobs/               # BullMQ workers
│   │   ├── routes/             # route aggregator
│   │   └── server.ts
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   ├── tests/
│   ├── docker-compose.yml
│   ├── .env.example
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/                   # Next.js storefront + admin
│   ├── src/
│   │   ├── app/
│   │   │   ├── (shop)/         # public storefront routes
│   │   │   ├── (auth)/         # login/signup
│   │   │   ├── account/        # customer account
│   │   │   └── admin/          # admin panel (role-gated)
│   │   ├── components/
│   │   ├── features/           # redux slices + RTK Query APIs
│   │   ├── lib/
│   │   └── styles/
│   ├── public/
│   ├── package.json
│   └── tsconfig.json
│
├── docs/                       # architecture notes, resume talking points
│   ├── ARCHITECTURE.md
│   ├── CACHING.md
│   ├── AUTH.md
│   ├── ORDER_STATE_MACHINE.md
│   └── WEBHOOKS.md
│
├── PLAN.md                     # this file
└── README.md
```

---

## Data Model (High-Level)

- **User** (id, firebaseUid[unique], email, name, role[CUSTOMER|ADMIN], createdAt) — no password stored; Firebase owns credentials
- **Revocation list** — Redis set `auth:revoked:uids` (with per-entry TTL to auto-expire). Middleware rejects any Firebase ID token whose UID appears here.
- **Address** (id, userId, line1, line2, city, state, pincode, phone, isDefault)
- **Category** (id, name, slug, parentId, createdAt)
- **Product** (id, name, slug, description, categoryId, basePrice, tsv, ratingAvg, ratingCount, createdAt)
- **ProductVariant** (id, productId, sku, size, color, price, stock)
- **ProductImage** (id, productId, url, altText, position)
- **Review** (id, productId, userId, purchaseOrderId, rating, title, comment, verifiedPurchase, status, moderatedAt, createdAt)
- **Cart** — Redis only (key: `cart:{userId}`, TTL 30 days). Written to `Order` on checkout.
- **Order** (id, userId, status, subtotal, shipping, tax, total, paymentId, addressSnapshot, createdAt)
- **OrderItem** (id, orderId, variantId, unitPrice, quantity, productSnapshot)
- **OrderStatusHistory** (id, orderId, fromStatus, toStatus, changedBy, note, createdAt)
- **Payment** (id, orderId, provider, providerPaymentId, providerOrderId, amount, status, rawPayload)
- **WebhookEvent** (id, provider, eventId, signature, payload, processedAt) — idempotency table

**Indexes worth calling out on the resume:**
- `products.tsv` (GIN) — full-text search
- `orders(userId, createdAt DESC)` — customer order history
- `webhook_events(provider, eventId)` UNIQUE — idempotency guard
- `users(firebaseUid)` UNIQUE — fast lookup on every authenticated request

---

## Order State Machine

```
              ┌───────────┐
              │  pending  │  (order created, awaiting payment)
              └─────┬─────┘
        ┌───────────┼─────────────┐
        ▼           ▼             ▼
   ┌────────┐  ┌──────────┐  ┌───────────┐
   │  paid  │  │cancelled │  │  failed   │
   └───┬────┘  └──────────┘  └───────────┘
       ▼
  ┌─────────┐
  │ shipped │
  └────┬────┘
       ▼
  ┌───────────┐
  │ delivered │
  └────┬──────┘
       ▼
  ┌──────────┐
  │ refunded │  (only from delivered or paid)
  └──────────┘
```

Enforced by a transitions map. Invalid transitions throw and log — never silently ignored.

---

## Phased Delivery

Each phase ends with a runnable milestone and a commit. Approval requested before each phase starts.

### **Phase 1 — Foundation & Scaffolding**
**Deliverable:** Repo skeleton, Docker infra, env config, health checks running.

- Root layout (`backend/`, `frontend/`, `docs/`)
- Docker Compose: Postgres + Redis with named volumes
- Backend: TS + Express + Pino + Prisma init + Zod env schema
- Backend: `/health` and `/health/deep` (checks db + redis)
- Frontend: Next.js 15 App Router + Tailwind + shadcn/ui + Redux store
- Frontend: landing page skeleton
- README with local dev instructions

**Exit criteria:** `docker compose up`, `pnpm dev` in both apps → both respond.

---

### **Phase 2 — Auth System (Firebase)**
**Deliverable:** Working email/password signup + login via Firebase, backend verifies + syncs users, role-based access with custom claims.

**Frontend**
- Firebase Web SDK integrated: `firebase/auth` (email + password only for now)
- `/signup`, `/login` pages using Firebase client
- On successful login: fetch ID token, call `POST /auth/session` on backend to upsert User row
- Auth slice tracks `{ user, idToken, role }`; RTK Query base query attaches `Authorization: Bearer <idToken>` and refreshes via Firebase SDK on 401
- Protected route wrapper reads role from custom claims

**Backend**
- Prisma model: `User` (firebaseUid unique, email, name, role, timestamps) — no passwords
- `firebase-admin` initialized from service-account env vars
- Middleware `requireAuth`: verify ID token via `admin.auth().verifyIdToken(token, checkRevoked=true)`, cache verified UID→user for 60s in Redis, reject if UID in revocation set
- Middleware `requireRole('ADMIN')`: reads role from custom claims (fallback to DB)
- Endpoints:
  - `POST /auth/session` — verifies token, upserts User row, returns profile
  - `GET /auth/me` — returns current user profile
  - `POST /auth/logout` — adds UID to Redis revocation set with TTL matching token expiry, calls `admin.auth().revokeRefreshTokens(uid)`
  - `POST /admin/users/:id/role` (admin-only) — updates DB role AND sets Firebase custom claim, forces re-auth
- Redis rate limiter on `/auth/*` (10 req / min per IP)

**Resume talking points:**
- Custom claims for RBAC (single source of truth, no DB hit on hot path)
- Redis-backed revocation list layered on top of Firebase for instant force-logout
- Verified-token caching (60s) to keep the hot path cheap

---

### **Phase 3 — Product Catalog + Admin CRUD**
**Deliverable:** Admin can manage products; customers can browse.

- Prisma models: `Category`, `Product`, `ProductVariant`, `ProductImage`
- Seed script: 5 categories, ~40 products with variants
- Admin endpoints (role-gated): create/update/delete product, variant, category; upload image URLs (Cloudinary optional or plain URL for now)
- Public endpoints: `GET /products`, `GET /products/:slug`, `GET /categories`
- **Redis cache** on listing + detail (keys: `products:list:{filterHash}`, `product:{slug}`, TTL 10 min)
- **Cache invalidation:** on any product/variant mutation, delete matching keys via tag set (`SADD invalidate:product:{id}` pattern)
- Frontend: product listing grid, product detail page, cart-less "add to cart" button (wired next phase)

**Resume talking point:** tag-based cache invalidation strategy.

---

### **Phase 4 — Search & Filters**
**Deliverable:** Fast, filterable product search.

- Postgres `tsvector` column on `products` (name + description) with GIN index
- Trigger to auto-update tsv on insert/update
- `GET /search?q=&category=&minPrice=&maxPrice=&minRating=&sort=&page=&limit=`
- Cursor-based pagination for infinite scroll option (also offset for admin views)
- Query builder handles combinatorial filters cleanly (no SQL injection surface — Prisma parameterized)
- Frontend: search bar in header, filter sidebar, sort dropdown, pagination

**Resume talking point:** why Postgres FTS was sufficient vs reaching for Elasticsearch.

---

### **Phase 5 — Cart (Redis-Backed)**
**Deliverable:** Fast add/update cart, guest→user cart merge on login.

- Redis hash per user: `cart:{userId}` → field=variantId, value=quantity
- Guest cart: `cart:guest:{sessionId}` cookie
- Endpoints: `GET /cart`, `POST /cart/items`, `PATCH /cart/items/:variantId`, `DELETE /cart/items/:variantId`, `DELETE /cart`
- Merge logic on login: sum quantities, cap at stock
- **Stock check on read** (join variant.stock), but stock is NOT reserved until checkout
- Frontend: cart drawer, cart page, mini-cart in header, optimistic updates

**Resume talking point:** Redis for cart — latency (~1ms vs 20ms), ephemeral nature, TTL for abandoned carts.

---

### **Phase 6 — Checkout + Payment (Razorpay)**
**Deliverable:** End-to-end checkout with webhook-confirmed payment.

- Endpoints:
  - `POST /checkout/session` — validates cart, creates `Order` (status=pending), reserves stock (atomic decrement in transaction), creates Razorpay order
  - `POST /webhooks/razorpay` — verifies signature, **idempotency check** via `WebhookEvent` table, transitions order pending→paid, enqueues confirmation email job
  - `POST /checkout/cancel` — releases stock, transitions to cancelled
- BullMQ queue: `payment-events` for webhook processing (fast ack, slow work)
- Stock decrement uses `SELECT ... FOR UPDATE` or Prisma `update` with WHERE stock>=qty to prevent oversell
- Frontend: multi-step checkout (address → review → pay), Razorpay checkout modal, success/failure pages

**Resume talking points:** webhook idempotency, stock reservation with concurrency, signature verification.

---

### **Phase 7 — Orders + State Machine + Admin Ops**
**Deliverable:** Full order lifecycle with admin controls.

- Order state machine module (`orders/stateMachine.ts`) — transitions map + `transition(order, toStatus, actor, note)` function
- Every state change writes `OrderStatusHistory`
- Customer endpoints: `GET /orders`, `GET /orders/:id`
- Admin endpoints: `GET /admin/orders`, `POST /admin/orders/:id/ship`, `POST /admin/orders/:id/deliver`, `POST /admin/orders/:id/cancel`, `POST /admin/orders/:id/refund`
- Refund path calls Razorpay refund API + updates status
- Frontend: `/account/orders`, `/account/orders/:id`, admin order table with status transitions

**Resume talking point:** state machine prevents invalid transitions like `delivered → pending`; audit log via history table.

---

### **Phase 8 — Admin Panel**
**Deliverable:** Cohesive admin UI.

- Admin layout (role-gated route group `app/admin/`)
- Dashboard: today's revenue, order count by status, low-stock alerts, top 5 products (last 30d)
- Product management: table, create/edit forms with variant editor
- Order management: filter by status, quick status transitions
- Basic analytics endpoints backed by aggregate SQL (window functions where cute)

---

### **Phase 9 — Polish, Docs, Deploy Prep**
**Deliverable:** Production-ready posture + resume-ready docs.

- Centralized error handler + typed API error responses
- Request ID propagation (Pino child logger per request)
- OpenAPI spec generated (zod-to-openapi) + Swagger UI at `/docs`
- Jest tests: auth flow, order state machine transitions, webhook idempotency, cache invalidation
- `docs/ARCHITECTURE.md` with C4-style diagram
- `docs/CACHING.md`, `docs/AUTH.md`, `docs/ORDER_STATE_MACHINE.md`, `docs/WEBHOOKS.md` — deep dives written as if for a design review
- Dockerfile for backend, Dockerfile for frontend
- README with: setup, architecture summary, resume talking points, screenshots


## Recommended Client & Customer Experience Roadmap

These phases are delivered one feature at a time. A phase is not marked complete
until its database changes, API contracts, frontend types, typechecks, automated
tests, and relevant storefront/admin smoke checks pass.

### **Phase 10A — Storefront UX + Marketing CMS** ✅
**Customer outcome:** A polished, responsive gym storefront with consistent
product merchandising and reliable account recovery.

- Responsive header and mobile navigation
- Admin-editable announcement, rewards ticker, hero carousel, featured products,
  spotlight content, sale pricing, and dispatch messaging
- Shared product cards and category tabs across homepage and shop
- Improved product gallery, variant selection, stock feedback, trust content, and
  mobile add-to-cart action
- Firebase password-reset flow

### **Phase 10B — Conversion + Checkout** ✅
**Customer outcome:** Fewer checkout barriers and clearer post-purchase updates.

- Guest checkout with a hashed, order-scoped access token
- Server-calculated coupons with admin CRUD
- Order status email adapter with optional Resend configuration
- Guest order success/failure access and secure cancellation

### **Phase 10C — Reviews & Ratings** ✅
**Customer outcome:** Shoppers can make more confident decisions using moderated,
verified-purchase feedback.

- Review model with one review per customer/product and moderation status
- Verified-purchase eligibility derived server-side from delivered order items
- Product rating aggregates maintained from approved reviews only
- Star summary and approved review list on product pages and product cards
- Review submission from delivered order details
- Admin moderation queue with approve/reject actions

**Exit criteria:** unverified submissions are rejected; pending reviews do not
affect public aggregates; approve/reject recalculates aggregates atomically;
backend tests and both app typechecks pass; product, order-detail, and admin review
screens smoke successfully.

### **Phase 10D — Wishlist + Back-in-Stock Alerts** ✅
**Customer outcome:** Signed-in shoppers can save products and return when stock is
available.

- Synced customer wishlist with optimistic UI
- Wishlist page and product-card/detail save controls
- Variant-level back-in-stock subscriptions
- Admin-visible demand counts and notification adapter

### **Phase 10E — Loyalty, Referrals + Retention** ✅
**Customer outcome:** Repeat purchases are rewarded through a transparent,
refund-safe points account.

- Append-only points ledger with cached account balances and unique idempotency keys
- Paid-order earnings and exact refund reversals inside the order-state transaction
- One-time referral attribution before first payment, qualified on the first paid
  order, with snapshotted and reversible bonuses
- Account rewards dashboard with balance, activity, referral sharing/status, and
  points-to-coupon redemption
- Private assigned reward coupons with atomic one-use checkout consumption
- Cancelled/failed/refunded coupon orders restore redeemed points exactly once
- Admin configuration, program totals, customer balances, manual audited
  adjustments, referral metrics, and recent ledger activity

**Exit criteria:** payment replay cannot double-award points; refund reverses the
original entries rather than recalculating; concurrent redemption/coupon use is
guarded; another account cannot use an assigned coupon; cancellation restores one
redemption; migration, policy tests, lifecycle smoke, typechecks, builds, and new
account/admin routes pass.

### **Phase 10F — Bundles + Subscriptions** ✅
**Customer outcome:** Customers can build repeat supplement routines with clear
savings.

- Admin-managed fixed-price or percentage-off bundles with scheduled availability
- Redis cart bundle identity, current server-calculated prices, and component-level
  stock limits
- Checkout snapshots retail value, bundle savings, coupon savings, and bundle
  components separately while reserving each variant atomically
- Variant-specific subscribe-and-save plans with verified-order enrollment
- Customer pause, resume, skip, and cancel controls with immutable renewal history
- Hourly, replay-safe renewal scans with ready/stock-blocked states and optional
  reminder email; renewals never auto-charge or reserve inventory
- Storefront bundle catalog, paid-order enrollment, account management, and complete
  admin consoles for bundles and subscription plans/renewals

**Exit criteria:** current component prices and stock are authoritative; mixed carts
reserve and release exact component quantities; coupon discounts apply after bundle
savings; duplicate due scans cannot create duplicate renewals; migrations, 39 policy
tests, both lifecycle smokes, typechecks, production builds, and all new public,
account, and admin routes pass.
### **Phase 10G — Discovery, SEO + Accessibility** ✅
**Customer outcome:** Faster discovery and a more inclusive shopping experience.

- Route-specific titles, descriptions, canonicals, Open Graph/Twitter imagery, web
  manifest, crawler rules, and a live active-product sitemap
- Server-rendered Product/Offer and Breadcrumb JSON-LD with current price, rating,
  currency, and per-variant availability
- Privacy-preserving browser-local recently viewed history, rehydrated against current
  active catalog data through a bounded cached API
- Explainable related-product ranking across category fit, price proximity, live
  stock, and rating signals
- Intrinsic/lazy image loading, LCP priority hints, image-origin preconnect, metadata
  revalidation, and below-the-fold code splitting
- Global skip/focus treatment, private-route noindex, reduced-motion support,
  pausable carousel semantics, and keyboard-contained cart/image dialogs

**Exit criteria:** sitemap and metadata use the configured public origin; inactive
products cannot appear in discovery responses; local history cannot supply price or
stock; recommendations exclude the source and return explainable reasons; motion and
modal keyboard behavior have explicit controls; 14 migrations remain current, 9
suites/43 tests, both typechecks, both production builds, all 32 generated routes,
and crawler/API/page/chunk live smokes pass.

## Production Launch Roadmap

### **Phase 11A — Production Launch Readiness** ✅
**Operator outcome:** Misconfigured releases fail before serving traffic, and the
platform has a repeatable, secret-safe container launch path.

- Shared local/staging/production environment policy with grouped Firebase,
  Razorpay, and email validation
- Production-only HTTPS, exact CORS, safe logging, live Razorpay key, and trusted
  proxy checks
- Frontend build-time validation for public URL and complete Firebase Web SDK values
- Safe liveness/readiness endpoints with release and capability metadata
- Password-protected Postgres/Redis production Compose example
- One-shot release migration service, application health checks, and non-root images
- Placeholder-only production env template and operator runbook

**Exit criteria:** backend policy tests, all existing suites, both typechecks, both
production builds, safe local config check, Compose interpolation, fail-fast invalid
frontend build, and live application health/storefront smokes pass.

### **Phase 11B — CI/CD, Backups + Observability**
**Operator outcome:** Automated releases, practiced recovery, and actionable alerts.

- CI pipeline for checks, image build, security scanning, and immutable tags
- Deployment approval/promotion with migration job and post-deploy smoke
- Scheduled encrypted database backups plus restore drill
- Centralized logs, uptime/error alerts, and operational dashboards
- Dependency/image update policy and incident/rollback playbook

---

## Resume Talking Points (Final Deliverable)


1. **Firebase Auth + custom claims + Redis revocation list** — server-side force-logout on top of managed auth
2. **Tag-based Redis cache invalidation** on product mutations
3. **Postgres FTS with tsvector + GIN** — why not Elasticsearch (scope/cost)
4. **Redis-backed cart** — latency + TTL + guest→user merge
5. **Webhook idempotency** via `WebhookEvent` unique constraint
6. **Stock reservation under concurrency** — no oversell
7. **Order state machine** — explicit transitions, audit trail
8. **Rate limiting** — sliding window in Redis
9. **BullMQ** — decoupling webhook receipt from processing

---

## Progress Tracker

- [x] Phase 1 — Foundation & Scaffolding
- [x] Phase 2 — Auth System
- [x] Phase 3 — Product Catalog + Admin CRUD
- [x] Phase 4 — Search & Filters
- [x] Phase 5 — Cart (Redis-Backed)
- [x] Phase 6 — Checkout + Payment
- [x] Phase 7 — Orders + State Machine + Admin Ops
- [x] Phase 8 — Admin Panel
- [x] Phase 9 — Polish, Docs, Deploy Prep
- [x] Phase 10A — Storefront UX + Marketing CMS
- [x] Phase 10B — Conversion + Checkout
- [x] Phase 10C — Reviews & Ratings
- [x] Phase 10D — Wishlist + Back-in-Stock Alerts
- [x] Phase 10E — Loyalty, Referrals + Retention
- [x] Phase 10F — Bundles + Subscriptions
- [x] Phase 10G — Discovery, SEO + Accessibility
- [x] Phase 11A — Production Launch Readiness
- [ ] Phase 11B — CI/CD, Backups + Observability







