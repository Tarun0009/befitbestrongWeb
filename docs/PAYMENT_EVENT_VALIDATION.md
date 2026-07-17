# Razorpay Payment Event Validation

## Problem

A valid webhook signature proves that Razorpay sent the bytes. It does not prove
that the event belongs to the expected local order, carries the checkout amount
and currency, represents a supported provider state, or is safe to apply after
the local reservation has expired. Treating signature verification as payment
verification can therefore mark the wrong commercial record paid.

Razorpay represents amounts in currency subunits and considers a payment
complete when its state is `captured`. The worker consequently validates the
provider entity against immutable values stored during checkout before calling
the order state machine.

References:

- <https://razorpay.com/docs/webhooks/payments/>
- <https://razorpay.com/docs/payments/payments/>
- <https://razorpay.com/docs/api/payments/capture/>

## Decision

Only these events can mutate local payment/order state:

| Provider event | Required entity state | Local transition |
| --- | --- | --- |
| `payment.captured` | `captured` | `PENDING -> PAID`, payment `CAPTURED` |
| `payment.failed` | `failed` | `PENDING -> FAILED`, payment `FAILED` |

Before either transition, the worker requires all of the following:

1. Stored provider is `razorpay` and stored event type equals the signed payload.
2. `payload.payment.entity` contains a payment id, order id, integer amount,
   currency, and the state required by the event type.
3. Optional payment/order entities in the same envelope agree with one another.
4. Provider order id resolves to a local PREPAID order and Razorpay payment row.
5. Provider order id matches both local records.
6. Amount matches `Order.total` and `Payment.amount` exactly in subunits.
7. Upper-cased currency matches `Order.currency` and `Payment.currency`.
8. A stored provider payment id is never overwritten by a different id.
9. Order/payment states permit the requested transition.

An exact already-applied event is a successful idempotent no-op. A capture for a
cancelled, expired, failed, shipped, or refunded order never revives the order;
it is quarantined for reconciliation because inventory or fulfillment may no
longer be safe.

## Auditable outcomes

Every deterministic worker result sets `WebhookEvent.processedAt` and records:

- `outcome`: `PROCESSED`, `IGNORED`, `REJECTED`, or
  `RECONCILIATION_REQUIRED`;
- `processingCode` and `processingMessage`;
- `localOrderId` when resolution succeeded;
- `providerPaymentId` when the provider entity supplied one.

Outcome meaning:

| Outcome | Meaning | Retry? |
| --- | --- | --- |
| `PROCESSED` | Transition committed or state already matched | No |
| `IGNORED` | Authenticated event is outside the supported mutation set | No |
| `REJECTED` | Supported payload is malformed or internally inconsistent | No |
| `RECONCILIATION_REQUIRED` | Valid provider data conflicts with local commerce data/state | Operator/provider reconciliation |

Deterministic outcomes are completed rather than retried as poison messages.
Database/queue failures still throw and use BullMQ's bounded exponential retry.
For an applied event, the audit update and commercial transition commit in the
same PostgreSQL transaction.

The structured log message `payment-events: reconciliation required` is the
alert hook. Until centralized alerting lands in Phase 13D, operators can inspect
the queue with:

```sql
SELECT "createdAt", "eventId", "processingCode", "processingMessage",
       "localOrderId", "providerPaymentId"
FROM "WebhookEvent"
WHERE provider = 'razorpay'
  AND outcome = 'RECONCILIATION_REQUIRED'
ORDER BY "createdAt" DESC;
```

Do not manually change an order from this query alone. Compare the Razorpay
Dashboard/API payment, reservation/inventory state, and refund/fulfillment state
before choosing fulfill, re-reserve, or refund.

## Durable ingest handoff

The endpoint first commits the unique webhook audit row, then enqueues its id.
If Redis enqueue fails it returns `503`, leaving the durable row unprocessed. A
Razorpay retry uses conflict-safe insertion, reloads that row, and re-enqueues it.
This closes the previous DB-commit/Redis-enqueue gap while queue `jobId` keeps the
handoff idempotent. A processed duplicate is simply acknowledged without producing
an expected unique-constraint error log.

## Verification

- Pure policy tests cover supported/unsupported types, malformed entities,
  event/state mismatch, amount/currency/payment-id mismatch, idempotent replay,
  and illegal late-capture state.
- `npm run smoke:payment-events` uses real PostgreSQL to prove capture, failure,
  replay, quarantine, rejection, and ignored-event behavior.
- The smoke asserts mismatched events do not change order, payment, or history.

## Rollout and rollback

Migration `20260716180000_payment_event_validation` is additive: nullable audit
columns and indexes plus a new enum. Apply it before deploying the new worker.
An old worker remains compatible but leaves the new outcome fields null.

Rollback the application first. Keep the columns and enum during rollback so
audit evidence is not destroyed. Removing them requires a later reviewed data
retention migration, not an emergency rollback.

## Residual risks / next slice

- There is not yet a provider-polling reconciliation worker or admin resolution
  workflow; reconciliation rows intentionally remain operator-visible evidence.
- `payment.authorized` is ignored. Auto-capture must be configured and captured
  state remains the fulfillment gate.
- Provider HTTP timeouts/retry budgets and the refund intent ledger are the next
  Phase 13B slices.
