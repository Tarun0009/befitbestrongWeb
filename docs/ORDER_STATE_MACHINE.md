# Order State Machine — Design Review

## Problem

Orders move through many statuses: `PENDING` → `PAID` → `SHIPPED` → `DELIVERED` → maybe `REFUNDED`, with `CANCELLED` and `FAILED` as escape hatches. The system has multiple actors that trigger these — the webhook worker (`system`), the customer (`customer`), and admin operators (`admin`). Without a central chokepoint:

- Invalid transitions leak in silently. `delivered → pending` on a bad code path is easy to write.
- Stock accounting drifts. Some paths release stock on cancel, others forget.
- There's no audit log. "Why did this order go from PAID to CANCELLED?" has no answer.
- Business rules scatter — "you can only refund a PAID or DELIVERED order" ends up as an `if` in five places.

## Options considered

### 1. Free-form status updates

Every route just calls `prisma.order.update({ status: "..." })`. Rely on convention + code review.

**Pros**: Simple.
**Cons**: Everything above. This is how state bugs happen.

### 2. DB CHECK constraint on status transitions

A trigger that validates old-status/new-status pairs.

**Pros**: Impossible to bypass.
**Cons**: Side effects (stock release, refund API call, history row) don't live in the DB — the trigger can't run them. So you still need application logic on top; the trigger is just extra scaffolding.

### 3. Application-layer state machine (chosen)

A single `transition()` function that (a) validates against a transitions map, (b) runs side effects atomically inside the same DB tx, (c) always writes to `OrderStatusHistory`.

**Pros**:
- One entry point → one place to audit.
- Side effects live with the transition. Cancel + release stock are one atomic step.
- History table is populated by construction — impossible to transition without writing history.
- Easy to add new statuses (just extend the map).

**Cons**: Nothing enforces "no direct `.order.update({status})` elsewhere" other than convention. Fix: grep for `data: { status:` in code review; add an ESLint rule if it ever becomes a problem.

## Decision

The state machine lives in [`modules/orders/stateMachine.ts`](../backend/src/modules/orders/stateMachine.ts). Everything that changes an order's status goes through `transition(db, orderId, to, opts)`.

### Transition map

```
PENDING   → PAID | CANCELLED | FAILED
CONFIRMED → SHIPPED | CANCELLED
PAID      → SHIPPED | REFUNDED
SHIPPED   → DELIVERED
DELIVERED → REFUNDED
FAILED    → (terminal)
CANCELLED → (terminal)
REFUNDED  → (terminal)
```

Rejected transitions we deliberately don't allow:

- `CONFIRMED → PAID` — COD confirmation is not payment; collection is recorded only on delivery.
- `PAID → CANCELLED` — a paid order isn't cancelled, it's refunded. Admin sees only the Refund button.
- `SHIPPED → REFUNDED` — while in transit, you don't refund yet; wait for DELIVERED or use CANCELLED before ship.
- `DELIVERED → SHIPPED` — you can't unship a delivered package. If it turns out to be lost, that's a support case, not a state change.

### Side effects table

| From → To | Stock | Payment row | External call |
|---|---|---|---|
| PENDING → PAID | keep decremented | status=CAPTURED | (webhook already succeeded) |
| PENDING → CANCELLED | release | payment may be marked FAILED for expiry | — |
| CONFIRMED → SHIPPED | keep decremented | COD remains CREATED | — |
| CONFIRMED → CANCELLED | release | — | — |
| PENDING → FAILED | release | status=FAILED | — |
| PAID → SHIPPED | keep decremented | — | — |
| PAID → REFUNDED | release | status=REFUNDED | ledger proof; no network call |
| SHIPPED → DELIVERED | keep decremented | COD becomes CAPTURED | — |
| DELIVERED → REFUNDED | keep decremented (return inspection is separate) | status=REFUNDED | ledger proof; no network call |

For unpaid `PENDING/CONFIRMED → CANCELLED/FAILED` transitions, ordinary coupon
usage is also returned inside the transaction. Loyalty coupons remain consumed
while their points are restored once through the ledger. Scheduled checkout
expiry uses `PENDING → CANCELLED`, sets `reservationExpiredAt`, and records
`checkout reservation expired` in history, so it shares the same exactly-once
side effects as customer cancellation and payment failure.

### Actor tracking

Every history row records who did it:

```ts
type Actor =
  | { kind: "system";   note?: string }              // webhook, dev-complete, cron
  | { kind: "customer"; userId: string; note?: string } // self-cancel
  | { kind: "admin";    userId: string; note?: string } // /admin/orders/:id/*
```

That's enough to answer support questions ("did WE cancel this or did they?") without a separate audit table.

## The refund boundary

`transition()` never calls Razorpay. The refund service first persists an intent,
uses its stable provider idempotency key outside every database transaction, and
records the provider outcome. Signed webhooks and a bounded polling worker repair
lost HTTP responses. Only cumulative `PROCESSED` intents equal to the captured
payment amount may call the state machine with `refundFinalization` proof.

That separation avoids database locks during network I/O while closing the old
“provider succeeded, local transaction failed” gap. A failed finalization remains
scheduled for reconciliation, and a direct admin/script transition to `REFUNDED`
returns `409 refund_ledger_required`. See
[`REFUND_LEDGER.md`](./REFUND_LEDGER.md).

## Where history is written

Two entry points:

1. **`recordInitialHistory(tx, orderId, actor)`** — called by `createCheckoutSession` inside the same transaction that inserts the Order row. Ensures every order starts with an audited `PENDING` (prepaid) or `CONFIRMED` (COD) row.
2. **`transition(db, orderId, to, opts)`** — called by everything else. The `orderStatusHistory.create` happens in the same tx as the `order.update`, so a partial commit is impossible.

The customer's `/orders/:id` and the admin's `/admin/orders/:id` both include the history array in the response — the frontend renders it as a timeline.

## What `transition()` guarantees

- The transition is legal per the map (throws `409 invalid_transition` otherwise).
- Side effects (stock, payment row) run in the same DB tx as the status change.
- History is written in the same DB tx.
- External refund calls live in the durable refund service, outside the order-state transaction.
- `REFUNDED` requires ledger finalization proof; active refunds also block shipment.
- Idempotent no-op if `from === to` (webhook retries land here).

## What it doesn't guarantee (yet)

- Distributed correctness across future services. Customer/admin email intent now
  commits through the transactional outbox, but a future independent service that
  reads `order.status` before commit can still see stale data. Publish any new
  cross-service event through an outbox instead of making an in-transaction network
  call.
- Cross-order invariants (e.g., "can't refund an order that has a chargeback dispute open"). Add specific pre-checks in `transition()` or split the function per verb if the branches grow.

## Resume-ready phrases

- "All order status changes route through one `transition()` function — it validates the map and writes stock, payment bookkeeping, loyalty, and history atomically."
- "History table auto-populated by construction. You can't change status without leaving an audit row, because the write is in the same tx as the status update."
- "Actor kind (system / customer / admin) + userId + note on every row — enough to answer 'who did this and why' without a separate audit service."
- "Refund provider I/O is isolated in a durable intent ledger; the order state machine accepts only processed-ledger proof and never holds a database transaction across provider I/O."
