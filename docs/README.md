# Docs

Deep-dive documents written as design-review artifacts. Filled in as each phase completes.

- `ARCHITECTURE.md` — system overview + C4 diagram (Phase 9)
- `FEATURE_STRUCTURE.md` — backend/frontend feature ownership, current migration debt, and the CI placement guard
- `AUTH.md` — Firebase + custom claims + Redis revocation flow (Phase 2)
- `CACHING.md` — Redis caching + tag-based invalidation strategy (Phase 3)
- `SEARCH.md` — Postgres FTS design, tradeoffs vs Elasticsearch (Phase 4)
- `CART.md` — Why Redis for cart, guest→user merge (Phase 5)
- `WEBHOOKS.md` — Razorpay webhook idempotency + BullMQ (Phase 6)
- `ORDER_STATE_MACHINE.md` — Transition map, audit trail (Phase 7)
- `SERVICEABILITY_COD_ADMIN_NOTIFICATIONS.md` — PIN coverage, COD lifecycle, demand tracking, and admin alerts (Phase 10H)
- `ADMIN_UPDATE_CONVENTIONS.md` — PATCH, PUT, dirty-form, nullable-field, and concurrency conventions for admin editors
- `ADMIN_UI_SYSTEM.md` — admin layout, typography, surfaces, controls, responsive behavior, and visual review checklist
- `PRODUCTION_CONFIGURATION.md` — Environment policy, containers, launch and rollback checks (Phase 11A)
- `PRODUCTION_READINESS.md` — Launch-blocking security, commerce reliability, testing, recovery, and performance gates (Phase 13)
- `CHECKOUT_IDEMPOTENCY.md` — persistent retry keys, owner scoping, processing leases, and concurrency verification (Phase 13B)
- `CHECKOUT_RESERVATION_EXPIRY.md` — bounded PENDING-order expiry with exactly-once stock, coupon, loyalty, and payment restoration (Phase 13B)
- `PAYMENT_EVENT_VALIDATION.md` — strict Razorpay order/amount/currency/state checks, auditable quarantine outcomes, and DB/queue handoff recovery (Phase 13B)
- `PROVIDER_HTTP_RELIABILITY.md` — bounded Razorpay deadlines/backoff, create-order receipt recovery, and refund idempotency (Phase 13B)
- `REFUND_LEDGER.md` — durable full/partial refund intents, webhooks, polling, concurrency controls, and operator recovery (Phase 13B)
- `EMAIL_OUTBOX.md` — atomic transactional email, retry leases, stable provider keys, dead-letter recovery, and admin operations (Phase 13B)
- `END_TO_END_TESTING.md` — Playwright architecture, local/CI operation, accessibility gate, artifacts, and coverage roadmap (Phase 13C)
- `FULFILLMENT.md` — shipment records, atomic dispatch, tracking events, and courier integration boundary (Phase 12A)

Each doc should read like a design review — problem, options considered, decision, tradeoffs.
