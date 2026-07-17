# End-to-End Browser and Accessibility Testing

Phase 13C adds a merge-blocking browser gate around production-compiled services.
The current gate protects the public catalog, authentication boundary, accessibility
baseline, and complete guest cash-on-delivery and prepaid checkout journeys while
the remaining transactional journeys are added feature by feature.

## Test architecture

Playwright starts the compiled Express API and Next.js application plus a local
Razorpay contract stub. The API talks to real PostgreSQL and Redis instances. CI
creates an isolated `e2e` database, applies every migration, seeds deterministic
catalog data, and installs only the pinned Chromium runtime required by the
configured projects.

The provider stub verifies Basic authentication and the create-order request, then
returns a Razorpay-shaped response. Playwright replaces only the hosted checkout
JavaScript in the browser so it can inspect the handoff without opening an external
payment UI. A correctly signed webhook then enters the real Express raw-body route,
durable database record, BullMQ queue, worker, state machine, and notification
transaction. Deployed environment validation locks the provider base URL to the
official Razorpay API; the override is accepted only in local/E2E execution.

The same test file runs as:

- desktop Chromium using Playwright's Desktop Chrome profile;
- mobile Chromium using the Pixel 7 profile;
- `en-IN` locale, `Asia/Kolkata` timezone, and light color scheme.

Two workers are used because full-page axe scans are CPU-heavy. Failures retain a
trace, screenshot, video, HTML report, and the complete axe result. CI keeps the
report artifact for 14 days.

## Current blocking coverage

The current 14-test desktop/mobile gate verifies:

1. PostgreSQL, Redis, and configuration readiness through `/health/ready`.
2. Deterministic seeded product data through the public catalog API.
3. Homepage-to-shop navigation, rendered product cards, and category filtering.
4. A `401 unauthenticated` API response and login redirect for anonymous admin
   access.
5. No automatically detectable WCAG 2.0/2.1 A or AA violations on the homepage or
   login page, on desktop and mobile.
6. A guest can add an isolated product to the cart, verify a supported PIN, place a
   COD order, land on the success page, securely reopen the order with its scoped
   guest token, and observe an empty cart. The response is also checked to ensure a
   COD order is `CONFIRMED`, has no Razorpay payload or reservation expiry, and is
   never represented as prepaid.
7. A guest prepaid order starts as `PENDING`, receives an expiring stock reservation,
   passes the server-calculated amount and customer prefill to Razorpay, accepts a
   valid signed `payment.captured` webhook, and becomes `PAID` with a `CAPTURED`
   payment. Replaying the same webhook creates no duplicate transition, and the
   scoped guest token, success page, and cleared cart remain correct.

The checkout journeys create a unique category, product variant, service-area PIN,
email, and cart for each run. Their setup command refuses production environments,
and `finally` cleanup removes owned orders, payment events, database/Redis data, and
catalog cache entries. This keeps parallel and retried runs isolated without relying
on shared seed stock.

Automated accessibility checks find only some accessibility problems. They are a
regression gate, not a replacement for keyboard, screen-reader, zoom, contrast, and
real-user review.

## Run locally

Prerequisites are Node.js, pnpm, Docker Desktop, installed dependencies, and compiled
backend/frontend builds. Keep the local database expendable before running the seed.

```bash
docker compose up -d --wait

cd backend
pnpm prisma:generate
pnpm migrate:deploy
pnpm prisma:seed
pnpm build

cd ../frontend
pnpm exec playwright install chromium
pnpm build
pnpm test:e2e
```

On Windows, build the frontend with `NEXT_DISABLE_STANDALONE=1`; the deployment
Docker build still produces the standalone artifact. Stop normal processes on ports
4000, 3005, and 4010 before the test. Playwright owns isolated compiled services and
waits for every health URL. `E2E_REUSE_EXISTING_SERVERS=1` is an explicit opt-in only
for processes already started with the exact E2E database and provider settings.

Useful commands:

```bash
pnpm test:e2e -- --project=desktop-chromium
pnpm test:e2e:headed
pnpm test:e2e:report
```

Generated `playwright-report`, `test-results`, and `blob-report` directories are
ignored by Git.

## CI gate

The `Browser and accessibility quality gate` job depends on the backend and frontend
quality jobs. It creates fresh PostgreSQL/Redis services, installs frozen lockfiles,
migrates and seeds the isolated database, builds both applications, installs
Chromium, and runs all projects. Any failed journey or accessibility rule blocks the
workflow.

The CI seed must never point at staging or production. Browser tests that mutate data
must create uniquely owned records or use isolated fixtures so parallel and retried
runs remain deterministic.

## Manual accessibility checklist

Record this checklist against staging before launch:

- Navigate header, menus, dialogs, forms, catalog filters, cart, and checkout using
  only keyboard controls; focus must remain visible and follow a logical order.
- Verify modal focus containment, Escape behavior, trigger focus restoration, and
  no keyboard traps.
- Test landmark, heading, form-error, status, price, and order announcements with
  NVDA plus Chrome, and one mobile screen reader.
- Validate at 200% and 400% zoom without lost content or two-dimensional scrolling
  except for genuine data tables.
- Confirm reduced-motion behavior and that information is never communicated only by
  color, animation, hover, or icon shape.
- Complete checkout, payment failure, COD, order tracking, cancellation, and admin
  fulfillment flows with assistive technology.

## Remaining Phase 13C slices

Add coverage in commercial-risk order: Firebase-authenticated account checkout;
admin fulfillment and refund operations; database-backed concurrency cases; then
the remaining Razorpay, Resend, Firebase, and Shiprocket adapter contracts. Each
slice must keep the full existing gate green.
