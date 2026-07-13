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
PAID      → SHIPPED | REFUNDED
SHIPPED   → DELIVERED
DELIVERED → REFUNDED
FAILED    → (terminal)
CANCELLED → (terminal)
REFUNDED  → (terminal)
```

Rejected transitions we deliberately don't allow:

- `PAID → CANCELLED` — a paid order isn't cancelled, it's refunded. Admin sees only the Refund button.
- `SHIPPED → REFUNDED` — while in transit, you don't refund yet; wait for DELIVERED or use CANCELLED before ship.
- `DELIVERED → SHIPPED` — you can't unship a delivered package. If it turns out to be lost, that's a support case, not a state change.

### Side effects table

| From → To | Stock | Payment row | External call |
|---|---|---|---|
| PENDING → PAID | keep decremented | status=CAPTURED | (webhook already succeeded) |
| PENDING → CANCELLED | release | — | — |
| PENDING → FAILED | release | status=FAILED | — |
| PAID → SHIPPED | keep decremented | — | — |
| PAID → REFUNDED | release | status=REFUNDED | Razorpay refund API |
| SHIPPED → DELIVERED | keep decremented | — | — |
| DELIVERED → REFUNDED | keep decremented (customer has the item) | status=REFUNDED | Razorpay refund API |

### Actor tracking

Every history row records who did it:

```ts
type Actor =
  | { kind: "system";   note?: string }              // webhook, dev-complete, cron
  | { kind: "customer"; userId: string; note?: string } // self-cancel
  | { kind: "admin";    userId: string; note?: string } // /admin/orders/:id/*
```

That's enough to answer support questions ("did WE cancel this or did they?") without a separate audit table.

## The refund network call

Refunds hit Razorpay's REST API. That's outside our DB. Two choices:

1. Call Razorpay inside the DB transaction — bad, holds row locks across a network call.
2. Call Razorpay first, then run the transaction — chosen.

Failure mode analysis:

- **Razorpay refund fails** → we throw before touching state. Order stays PAID/DELIVERED. Admin sees the error and can retry.
- **Razorpay refund succeeds, our DB tx fails** → money refunded to the customer but our order still says PAID. On next attempt the state machine sees the mismatch — the operator sees the payment history in the Razorpay dashboard and can decide (in practice: bump the order manually via a script, or Razorpay's dashboard notes the refund even if we retry — refund idempotency needs a Phase 7.5 fix if this becomes a real problem).

For a demo the first failure mode is what happens 99% of the time. Production would add idempotency keys and a reconciliation cron.

## Where history is written

Two entry points:

1. **`recordInitialHistory(tx, orderId, actor)`** — called by `createCheckoutSession` inside the same transaction that inserts the Order row. Ensures every order starts life with a `{fromStatus: null, toStatus: PENDING}` row.
2. **`transition(db, orderId, to, opts)`** — called by everything else. The `orderStatusHistory.create` happens in the same tx as the `order.update`, so a partial commit is impossible.

The customer's `/orders/:id` and the admin's `/admin/orders/:id` both include the history array in the response — the frontend renders it as a timeline.

## What `transition()` guarantees

- The transition is legal per the map (throws `409 invalid_transition` otherwise).
- Side effects (stock, payment row) run in the same DB tx as the status change.
- History is written in the same DB tx.
- External calls (Razorpay refund) happen BEFORE the DB tx so we don't hold locks. If they fail, we haven't changed local state yet.
- Idempotent no-op if `from === to` (webhook retries land here).

## What it doesn't guarantee (yet)

- Distributed correctness across services. If a future service reads `order.status` before the state machine's tx commits, it'll see stale data. Fix if it matters: use `SERIALIZABLE` isolation or an outbox pattern.
- Cross-order invariants (e.g., "can't refund an order that has a chargeback dispute open"). Add specific pre-checks in `transition()` or split the function per verb if the branches grow.

## Resume-ready phrases

- "All order status changes route through one `transition()` function — validates against a transitions map, writes to `OrderStatusHistory` atomically, and runs side effects (stock release / Razorpay refund) in the same DB transaction."
- "History table auto-populated by construction. You can't change status without leaving an audit row, because the write is in the same tx as the status update."
- "Actor kind (system / customer / admin) + userId + note on every row — enough to answer 'who did this and why' without a separate audit service."
- "External refund calls happen BEFORE opening the DB transaction — never hold Postgres row locks across a network round-trip to a payment gateway."
