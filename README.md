# beFitBeStrong

[![CI](https://github.com/Tarun0009/befitbestrongWeb/actions/workflows/ci.yml/badge.svg)](https://github.com/Tarun0009/befitbestrongWeb/actions/workflows/ci.yml)
[![Security](https://github.com/Tarun0009/befitbestrongWeb/actions/workflows/security.yml/badge.svg)](https://github.com/Tarun0009/befitbestrongWeb/actions/workflows/security.yml)

A full-stack fitness commerce platform for supplements, home-gym equipment,
training apparel, and accessories. It combines a responsive customer storefront,
secure checkout, account features, and an operational admin console.

## Highlights

### Storefront and customer experience

- Responsive product catalog with search, filters, sorting, and pagination
- Product variants, live stock feedback, bundles, subscriptions, and sale pricing
- Redis-backed guest and authenticated carts with automatic cart merging
- Guest or account checkout with server-calculated coupons, Razorpay, and PIN-controlled COD
- Delhi/Noida/Ghaziabad delivery checks with unsupported-area expansion requests
- Customer orders, reviews, wishlist, stock alerts, rewards, and referrals
- SEO metadata, structured product data, sitemap, accessible dialogs, and reduced-motion support

### Administration

- Role-protected dashboard and customer management
- Product, category, variant, bundle, and subscription management
- Order lifecycle controls with auditable prepaid/COD states, refunds, and persistent alerts
- Transactional email delivery console with retry history and dead-letter recovery
- Service-area, COD-policy, delivery-estimate, and expansion-demand management
- Homepage merchandising, coupons, review moderation, demand, and loyalty tools
- Revenue, order, product, inventory, referral, and retention reporting

### Platform engineering

- Firebase Authentication with backend token verification and revocation support
- PostgreSQL catalog, order, payment, review, loyalty, and subscription data
- PostgreSQL full-text search with weighted ranking and GIN indexing
- Redis caching, carts, rate limiting, and BullMQ background processing
- Idempotent Razorpay webhooks and concurrency-safe stock reservation
- PostgreSQL-backed transactional email outbox with bounded Resend delivery
- Playwright desktop/mobile journeys with automated WCAG A/AA checks in CI
- Fail-fast production configuration, health checks, Docker images, and release migrations

## Architecture

```text
Browser
  |
  v
Next.js storefront and admin :3005
  |
  v
Express API :4000
  |-------------------|
  v                   v
PostgreSQL :5434     Redis :6381
                       |
                       v
                  BullMQ workers
```

## Technology

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, React 19, TypeScript, Redux Toolkit, RTK Query, Tailwind CSS |
| Backend | Node.js 20, Express, TypeScript, Zod, Pino |
| Data | PostgreSQL 16, Prisma ORM, Redis 7 |
| Authentication | Firebase Auth and Firebase Admin SDK |
| Payments | Razorpay and signed webhooks |
| Background work | BullMQ |
| Testing | Jest, ts-jest, Playwright, and axe-core |
| Deployment | Docker Compose and multi-stage non-root images |

## Local development

### Requirements

- Node.js 20 or newer
- Corepack with pnpm 10.34.5
- Docker Desktop

### Start PostgreSQL and Redis

```bash
docker compose up -d
```

### Start the API

```bash
cd backend
cp .env.example .env
corepack enable
pnpm install
pnpm prisma:generate
pnpm prisma:migrate
pnpm prisma:seed
pnpm dev
```

The API runs at `http://localhost:4000`. Readiness is available at
`http://localhost:4000/health/ready`.

### Start the web application

```bash
cd frontend
cp .env.local.example .env.local
corepack enable
pnpm install
pnpm dev
```

The storefront runs at `http://localhost:3005`. Firebase values are required for
sign-up, login, customer accounts, and the admin console. Anonymous catalog browsing
continues to work in local development without them.

## Useful routes

| Area | URL |
|---|---|
| Storefront | `http://localhost:3005` |
| Product catalog | `http://localhost:3005/shop` |
| Customer account | `http://localhost:3005/account` |
| Admin console | `http://localhost:3005/admin` |
| Web health | `http://localhost:3005/health` |
| API readiness | `http://localhost:4000/health/ready` |

Admin access requires a Firebase-authenticated user whose application role is
`ADMIN`. See [authentication documentation](./docs/AUTH.md) for the authorization
model.

## Validation

```bash
cd backend
pnpm config:check
pnpm typecheck
pnpm test
pnpm build

cd ../frontend
pnpm typecheck
pnpm lint
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

The backend test suite covers environment policy, state transitions, payment
signatures, caching, reviews, stock alerts, loyalty, bundles, subscriptions, and
discovery rules. The browser gate starts compiled services and checks the public
catalog, admin authentication boundary, isolated guest COD and Razorpay/webhook
prepaid checkout, and automated WCAG A/AA results in desktop and mobile Chromium.
The CI architecture check also protects feature-folder ownership. See the
[end-to-end testing guide](./docs/END_TO_END_TESTING.md).

## Delivery automation

Pull requests run separate backend and frontend quality gates plus CodeQL and
dependency review. Version tags publish immutable backend and frontend images to
GitHub Container Registry, and production deployment requires a protected manual
approval with a full release commit SHA.

The [CI/CD learning guide](./docs/CI_CD_GUIDE.md) explains the workflows, one-time
GitHub and server configuration, normal team routine, release procedure, rollback,
troubleshooting, and hands-on exercises.

## Production deployment

Production configuration is intentionally separate from local development.
Prepare the ignored deployment environment file from the supplied template:

```bash
cp deploy/.env.production.example deploy/.env.production

docker compose \
  --env-file deploy/.env.production \
  -f deploy/docker-compose.production.example.yml \
  config --quiet
```

Production releases are built by the `Release images` workflow and deployed by the
protected `Deploy production` workflow; the server does not rebuild application
images. The deployment example uses protected data services, exact HTTPS origins,
container health checks, non-root application users, and a one-time Prisma migration
service. Read the [production configuration guide](./docs/PRODUCTION_CONFIGURATION.md)
and [CI/CD guide](./docs/CI_CD_GUIDE.md) before deploying.

## Documentation

- [Architecture](./docs/ARCHITECTURE.md)
- [Feature-based folder structure](./docs/FEATURE_STRUCTURE.md)
- [Serviceability, COD, and admin notifications](./docs/SERVICEABILITY_COD_ADMIN_NOTIFICATIONS.md)
- [Authentication and authorization](./docs/AUTH.md)
- [Caching](./docs/CACHING.md)
- [Search](./docs/SEARCH.md)
- [Cart design](./docs/CART.md)
- [Payment webhooks](./docs/WEBHOOKS.md)
- [Payment event validation](./docs/PAYMENT_EVENT_VALIDATION.md)
- [Provider HTTP reliability](./docs/PROVIDER_HTTP_RELIABILITY.md)
- [Refund intent ledger](./docs/REFUND_LEDGER.md)
- [Durable transactional email outbox](./docs/EMAIL_OUTBOX.md)
- [End-to-end browser and accessibility testing](./docs/END_TO_END_TESTING.md)
- [Order state machine](./docs/ORDER_STATE_MACHINE.md)
- [Reviews](./docs/REVIEWS.md)
- [Wishlist and stock alerts](./docs/WISHLIST.md)
- [Loyalty and referrals](./docs/LOYALTY.md)
- [Bundles and subscriptions](./docs/BUNDLES_SUBSCRIPTIONS.md)
- [Discovery, SEO, and accessibility](./docs/DISCOVERY_SEO_ACCESSIBILITY.md)
- [Production configuration](./docs/PRODUCTION_CONFIGURATION.md)
- [CI/CD workflow and learning guide](./docs/CI_CD_GUIDE.md)
- [OpenAPI specification](./docs/openapi.yaml)

## Security

Real environment files, private keys, service-account JSON, local AI configuration,
and internal planning notes are excluded from Git. Never commit Firebase Admin,
Razorpay, database, Redis, or email-provider secrets.
