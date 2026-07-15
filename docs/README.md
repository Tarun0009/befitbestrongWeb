# Docs

Deep-dive documents written as design-review artifacts. Filled in as each phase completes.

- `ARCHITECTURE.md` — system overview + C4 diagram (Phase 9)
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

Each doc should read like a design review — problem, options considered, decision, tradeoffs.
