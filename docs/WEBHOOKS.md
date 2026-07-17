# Webhooks & Payment — Design Review

## Problem

A Razorpay webhook is the ONLY reliable signal that a payment succeeded. The client-side confirmation is a hint (they saw "success" on the modal); the webhook is the truth. Two hard constraints follow:

1. **Idempotency.** Razorpay retries any delivery that doesn't 2xx within seconds. We must handle the same event any number of times without applying its effects twice — no double-transitions, no re-decremented stock, no duplicate "order paid" emails.
2. **Fast ACK.** Razorpay's retry budget is short. The webhook endpoint must respond in <2s, ideally <500ms. So the endpoint has to hand real work off to a background worker.

Adjacent problem: **stock oversell**. If two shoppers race for the last unit, exactly one order must succeed and the other must bounce with `insufficient_stock`.

## Options considered — Idempotency

### 1. In-memory dedupe (LRU keyed on event id)

**Pros**: Instant.
**Cons**: Loses state on restart; fails hard if we scale to more than one instance. Not a viable durability story.

### 2. Redis SET NX with TTL

**Pros**: Fast, distributed, one round-trip.
**Cons**: TTL means old events could resurface if Redis loses data. Also splits the source of truth: the event exists in Redis (dedupe), but its details live nowhere else — no audit log.

### 3. Postgres unique constraint on `(provider, eventId)` (chosen)

**Pros**:
- The DB is the audit log AND the dedupe mechanism — same row.
- Impossible to skip idempotency check by accident; you'd have to actively remove the constraint.
- Survives every kind of restart, replica failover, whatever.
- The INSERT + UNIQUE compound is one round-trip; conceptually the same as `SET NX`.

**Cons**: Slightly slower than Redis (a few ms). Fine — we're already committing to a DB write for the audit row.

## Decision — Idempotency

`WebhookEvent` table with `@@unique([provider, eventId])`. On webhook receipt:

1. Verify signature (constant-time compare).
2. `INSERT INTO WebhookEvent (...) ON CONFLICT DO NOTHING`.
3. Reload the durable row. When the insert conflicted, ACK it if already processed;
   otherwise re-enqueue it to recover a prior DB/Redis handoff failure.
4. Otherwise → enqueue a BullMQ job carrying the row id and `200 OK`.

The **worker** validates provider order id, payment id, amount, currency, provider
state, and legal local state before the actual transition. It also re-checks
`WebhookEvent.processedAt`, so BullMQ redelivery cannot double-apply.

Two layers of dedupe:
- Layer 1: Postgres unique index — catches "same event, second delivery from Razorpay."
- Layer 2: `processedAt` timestamp — catches "same job, redelivered by the worker."

## Options considered — Fast ACK

### 1. Synchronous processing

**Pros**: Simple.
**Cons**: Slow paths (state transitions, sending emails, calling third-party APIs) block the ACK. Any downstream hiccup → retry storm from Razorpay.

### 2. Background worker (chosen)

Webhook endpoint's job is ONLY: verify signature, persist event, enqueue job, ACK. The `payment-events` BullMQ queue owns everything from there. Retries with exponential backoff, up to 5 attempts.

## Options considered — Stock reservation

### 1. `SELECT ... FOR UPDATE` inside a transaction

**Pros**: Classical Postgres pattern.
**Cons**: Row-level locks held for the duration of the transaction — including any external calls we may make inside it. Small chance of deadlock on multi-item orders if two carts overlap in different orders.

### 2. Optimistic conditional UPDATE (chosen)

```
UPDATE "ProductVariant"
   SET stock = stock - :qty
 WHERE id = :variantId
   AND stock >= :qty
```

If a concurrent order took the last piece, this UPDATE returns 0 rows changed. Prisma's `updateMany` exposes the affected count directly — we bail the whole transaction and return `insufficient_stock`.

**Pros**:
- No row locks held longer than the single UPDATE.
- Read + check + write in one statement — nothing to hold open across an external call.
- Naturally atomic under any isolation level.
- Simple.

**Cons**: On very hot rows, several concurrent orders may collide in a burst. Retries are fine — we just tell the loser.

## Full checkout flow

```
POST /checkout/session (auth or guest cart + Idempotency-Key)
        │
        ▼
    INSERT CheckoutAttempt
    - UNIQUE(ownerHash, keyHash)
    - same request replays the original order
    - different request with same key is rejected
        │
        ▼
    ┌──────────────┐    "UPDATE ... WHERE stock >= qty"
    │ prisma.$tx() │    - per line, in the same tx
    │              │    - creates Order (PENDING)
    │              │    - snapshots address + product data
    └──────┬───────┘
           ▼
    createRazorpayOrder()      ← REST call to Razorpay
           │
           ▼
    ┌──────────────┐
    │ prisma.$tx() │    - link Order.providerOrderId
    │              │    - create Payment(CREATED)
    └──────┬───────┘
           ▼
    clearCart(user)
           ▼
    respond { orderId, razorpay: { orderId, keyId } }

... user completes payment on Razorpay-hosted modal ...

POST /webhooks/razorpay (raw body, HMAC-SHA256 verified)
        │
        ▼
    INSERT ... ON CONFLICT DO NOTHING into WebhookEvent
        │ (conflict → ACK processed row or re-enqueue unprocessed row)
        ▼
    paymentEventsQueue.add({ webhookEventId })
        ▼
    ACK 200 (Razorpay stops retrying)

... background worker picks up the job ...

    findUnique(WebhookEvent) → skip if processedAt set
        │
        ▼
    parse + validate event
        - type/payload/state mismatch → REJECTED, no commercial write
        - amount/currency/id/local-state drift → RECONCILIATION_REQUIRED
        - unsupported event → IGNORED
        - "payment.captured" → Order PENDING → PAID + Payment CAPTURED
        - "payment.failed"   → Order PENDING → FAILED + RELEASE stock
        │
        ▼
    UPDATE WebhookEvent SET outcome/code/identifiers, processedAt = now()
```

## Snapshotting: why `productSnapshot` and `addressSnapshot`

Orders must be a truthful record of what happened. If the merchant renames a product or the customer edits their saved address, the order should still show the exact name, price, and shipping details as they were at checkout time.

We store:
- `OrderItem.productSnapshot` — name, slug, sku, size, color, image at time of purchase
- `OrderItem.unitPrice` — the price the customer actually paid, not `variant.price` today
- `Order.addressSnapshot` — full shipping address as a JSON blob, independent of the `Address` row

This is the same pattern that Stripe, Shopify, and most order systems use. It's also what auditors and support agents need — "what did this customer actually order?"

## Dev-mode shortcut

To keep the demo working before Razorpay keys are wired up, `POST /checkout/dev-complete` flips a PENDING order to PAID without going through the payment gateway. It's gated on `NODE_ENV !== "production"` and refuses to run otherwise. The frontend automatically uses this path when `/checkout/config` reports `razorpayConfigured: false && devMode: true`. Documented as a demo-only path; production must set the keys and the webhook secret.

## What's not here yet

- **Refund path.** `POST /admin/orders/:id/refunds` creates a durable intent;
  signed refund events and bounded polling converge through one ledger service.
  See [`REFUND_LEDGER.md`](./REFUND_LEDGER.md).
- **Retry-on-failure UX.** The failure page offers Cancel; a proper retry that reopens the same Razorpay modal against the same order would be nicer.
- **Provider polling reconciliation.** Durable received events survive worker/Redis
  downtime, but events never delivered by the provider and checkout/provider-link
  drift still require a periodic API comparison against local Order state.

Checkout request idempotency is now documented separately in
[`CHECKOUT_IDEMPOTENCY.md`](./CHECKOUT_IDEMPOTENCY.md). Its database-backed
concurrency smoke proves duplicate client requests create one local order and
reserve stock once. Provider-call crash reconciliation remains a separate
production boundary.

Abandoned PENDING reservations are handled by the bounded repeatable worker in
[`CHECKOUT_RESERVATION_EXPIRY.md`](./CHECKOUT_RESERVATION_EXPIRY.md). It restores
stock, normal coupon usage, loyalty value, and payment state in the same
optimistic order-transition transaction.

Strict provider-event validation and auditable mismatch quarantine are documented
in [`PAYMENT_EVENT_VALIDATION.md`](./PAYMENT_EVENT_VALIDATION.md).

## Resume-ready phrases

- "Idempotent webhook handler backed by a Postgres UNIQUE(provider, eventId) — the source of truth AND the dedupe key are the same row."
- "Two-layer dedupe: UNIQUE constraint catches Razorpay's retries at ingest; `processedAt` catches BullMQ redeliveries at the worker."
- "Webhook ACK is <100ms — signature verify + row insert + enqueue. All state transitions run in a BullMQ worker with exponential backoff."
- "Stock reservation via `UPDATE ... WHERE stock >= qty` — atomic, no row locks held across the transaction, no oversell possible."
- "Order + address + product snapshots at checkout — the order is a truthful audit even after prices, catalog, or addresses change."
