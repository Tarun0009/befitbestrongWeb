# Production Readiness and Launch Gates

This document is the launch contract for beFitBeStrong. A feature being present
does not make it production-ready: every launch gate below must have code,
automated verification, operational ownership, and a tested failure path.

## Launch rule

Do not accept real customer payments until all P0 gates are complete and one
staging release has passed the full prepaid, COD, fulfillment, cancellation,
refund, backup/restore, and rollback checklist with production-shaped data.

## Delivery sequence

### Phase 13A — Security and runtime baseline (P0) — COMPLETE (2026-07-16)

- [x] Move Next.js to the latest supported Maintenance-LTS release without changing
  framework major versions.
- [x] Move React and React DOM to a patched compatible release.
- [x] Keep `eslint-config-next` aligned with the runtime.
- [x] Replace the retired registry-audit job with an OSV scan of both pnpm lockfiles.
- [x] Keep CodeQL, dependency review, Dependabot, immutable image tags, and SHA-pinned
  actions.
- [x] Add frontend security headers, remove unnecessary framework disclosure, and
  make lint a blocking CI check.

Exit gate: no known high/critical runtime advisory in the selected framework
line; both lockfiles scan; all tests, typechecks, builds, routes, and live smokes
pass.

### Phase 13B — Checkout, payment, refund, and email reliability (P0) — COMPLETE (2026-07-16)

- [x] Persist checkout idempotency keys and return the original response for safe
  client/network retries.
- [x] Expire abandoned PENDING orders and restore stock, coupons, and loyalty exactly
  once.
- [x] Validate webhook provider order, amount, currency, payment state, and supported
  event before changing commercial state.
- [x] Add provider timeouts and bounded retry policy.
- [x] Introduce a refund intent/ledger so provider and database outcomes can be
  reconciled after partial failure; support partial refunds only through that
  ledger.
- [x] Move customer/admin email delivery behind a durable outbox/worker with
  provider idempotency, bounded retries, source validation, dead-letter recovery,
  and an admin operations view.

Exit gate: duplicate checkout calls create one order; stale reservations recover;
payment/refund replay and crash boundaries are integration-tested; reconciliation
repairs simulated provider/database drift.

### Phase 13C — End-to-end quality gates (P0)

- [ ] PostgreSQL/Redis API integration suite with isolated test data.
- [ ] Concurrency tests for stock, coupons, loyalty redemption, checkout idempotency,
  webhook replay, shipment replay, and subscription renewal.
- [x] Playwright foundation runs compiled services against isolated PostgreSQL and
  Redis in CI, with desktop/mobile coverage for readiness, public catalog navigation,
  and the unauthenticated admin boundary.
- [x] Guest COD Playwright journey covers isolated cart/product/PIN setup, address
  validation, server-created order, scoped guest access, success UI, and cart cleanup
  on desktop and mobile.
- [x] Guest prepaid Playwright journey covers provider order creation, browser
  Razorpay handoff, signed durable webhook processing, payment capture, replay
  deduplication, guest success UI, and cart cleanup on desktop and mobile.
- [ ] Add the remaining transactional Playwright journeys for authenticated
  checkout/account, authenticated admin, fulfillment, and refunds.
- [x] Automated WCAG A/AA scans block homepage/login regressions and retain full
  browser evidence; shared foreground tokens now pass the first gate.
- [ ] Execute and record the keyboard/screen-reader manual checklist in staging.
- [ ] Contract tests for Razorpay, Resend, Firebase, and Shiprocket adapters.

Exit gate: critical journeys run in CI and failures block merge/release.

### Phase 13D — Operations, recovery, and observability (P0)

- Scheduled encrypted PostgreSQL backups with retention and restore verification.
- Central error reporting, structured log collection, metrics, traces, uptime
  checks, queue/dead-letter alerts, and business alerts.
- Separate API and worker process roles so each can scale and deploy safely.
- Incident, rollback, key-rotation, backup, refund, courier, and degraded-mode
  runbooks with named ownership.

Exit gate: a restore drill and rollback drill meet documented RPO/RTO; injected
API, database, Redis, queue, email, payment, and courier failures raise actionable
alerts.

### Phase 13E — Performance and launch certification (P1)

- Define API latency/error-rate, Core Web Vitals, bundle-size, database, and queue
  SLOs with CI budgets.
- Run production-like load, spike, soak, cache-cold, and dependency-failure tests.
- Optimize images, homepage data delivery, cache stampedes, expensive queries, and
  production indexes from measured evidence.
- Finish customer support, verified contact/admin MFA, invoices, privacy, terms,
  shipping, cancellation, and return-policy experiences.
- Remove or implement every storefront promise and placeholder.
- Complete Phase 12C NDR/RTO/COD risk and Phase 12D returns/refunds before launch.

Exit gate: staging launch rehearsal passes at target load with no P0/P1 defects,
legal/operations sign-off, monitored rollback, and reconciled test orders.

## Required verification for every slice

1. Migration and backward-compatibility review when persistence changes.
2. Unit, integration, concurrency, and relevant browser tests.
3. Backend/frontend typechecks and production builds.
4. Security scan and secret-safe configuration check.
5. Live health, auth boundary, API, page, worker, and failure-path smokes.
6. Documentation, operational metric/alert, rollback, and residual-risk update.

## Current evidence baseline

- 22 migrations are applied locally.
- Next.js 15.5.20, React/React DOM 19.0.7, and aligned
  `eslint-config-next` 15.5.20 are installed with exact versions.
- OSV Scanner 2.3.8 reports no known vulnerabilities in either pnpm lockfile.
- Frontend lint, both typechecks, 20 backend suites / 121 tests, and both
  production builds pass; 35 routes generate.
- The compiled-service browser gate passes 14/14 tests across desktop and mobile,
  including isolated guest COD and prepaid transactions, the real payment-event
  queue worker, replay safety, and automated WCAG A/AA scans.
- The frontend feature-placement check blocks new feature APIs in `src/lib` and
  root-level E2E specs; six early API files remain explicitly tracked migration debt.
- Compiled live smokes return HTTP 200 for API liveness/readiness, homepage,
  shop, cart, login, admin shell, frontend health, and the frontend API proxy.
- Frontend responses include HSTS, frame denial, MIME-sniffing protection,
  strict referrer policy, COOP, and Permissions Policy; framework disclosure is
  disabled.
- Catalog/search cache hits are fast locally, but no production-shaped load or
  Core Web Vitals gate exists yet.
- Local Firebase is configured; live payment, email, and courier credentials are
  not configured, so production provider UAT remains mandatory.

## Current launch blockers

- Phase 13B commerce reliability is complete in code: checkout replay, expiry,
  strict payment validation, bounded provider retries, refund reconciliation, and
  durable notification delivery all have database-backed recovery tests.
- Remaining integration/concurrency and authenticated account/admin/fulfillment
  browser suites, backup restore drills, alerting, load budgets, production provider
  credentials, and the staging launch rehearsal are still required by Phases
  13C–13E.
- Phase 12C NDR/RTO/COD risk handling and Phase 12D returns/refunds remain open.
