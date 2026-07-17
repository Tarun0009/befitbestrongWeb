# Refund Intent Ledger and Reconciliation

Phase 13B moves refunds out of the order transition handler and into a durable,
auditable workflow. A provider timeout can no longer leave the system with only
an operator's memory of whether money moved.

## Invariants

- Every commercial refund starts as one `RefundIntent` with an immutable
  `RefundEvent` timeline.
- The admin request requires an `Idempotency-Key`. The stored key hash is unique
  per order, and its request hash binds the key to amount, currency, and reason.
- Each intent receives one stable, random provider idempotency key. Every retry
  sends that same key and request body.
- `REQUESTED`, `PROCESSING`, `PENDING`, `PROCESSED`, and
  `RECONCILIATION_REQUIRED` reserve their amount. `FAILED` releases it.
- The payment row is locked while reserving or applying a result, preventing two
  concurrent requests from exceeding the captured amount.
- Only cumulative `PROCESSED` intents equal to the captured payment can mark the
  payment and order `REFUNDED`.
- Direct calls to `transition(..., "REFUNDED")` are rejected without ledger
  finalization proof.
- Partial refunds are allowed only after `DELIVERED`. Before shipment, a `PAID`
  order can refund only its complete captured balance.
- An order with an active refund cannot be shipped.

## Status model

| Status | Meaning | Balance reserved | Automatic action |
|---|---|---:|---|
| `REQUESTED` | Durable intent created | yes | submit to provider |
| `PROCESSING` | Worker/admin owns a bounded lease | yes | POST or GET provider |
| `PENDING` | Provider accepted but has not completed | yes | poll and accept webhook |
| `PROCESSED` | Provider confirms money movement | yes | finalize order if cumulative total is full |
| `FAILED` | Provider definitively rejected/failed | no | operator may create a new intent |
| `RECONCILIATION_REQUIRED` | HTTP result or local outcome is ambiguous | yes | retry with the same provider key |

Processing leases recover crashed workers. Reconciliation uses exponential
backoff capped at one hour and stops automated provider attempts after ten
claims, leaving the durable record for operations review.

## Provider convergence

All three entry paths call `applyProviderRefundOutcome`:

1. the initial idempotent Razorpay refund request;
2. signed `refund.created`, `refund.processed`, and `refund.failed` webhooks;
3. the repeating `refund-reconciliation` BullMQ scan and admin “Check provider
   now” action.

Webhook correlation prefers the provider refund id and can fall back to the
`refundIntentId` placed in Razorpay notes. Amount, payment id, currency, refund
id, and provider status are validated before ledger mutation. Razorpay's refund
GET endpoint is used once a provider refund id exists; otherwise the original
idempotent POST is replayed.

Defaults:

```env
REFUND_RECONCILIATION_SCAN_SECONDS=300
REFUND_RECONCILIATION_BATCH_SIZE=25
```

## Admin and customer experience

`POST /admin/orders/:id/refunds` accepts an integer amount in currency subunits
and a reason. The admin order page displays processed, pending, and available
balances, the immutable timeline, provider errors, and manual reconciliation.
The customer order page shows safe refund amounts, reasons, and current status.

The analytics dashboard subtracts processed partial refunds from revenue. A full
refund transitions the order to `REFUNDED`, so it is excluded from recognized
sales entirely.

## Loyalty and inventory

Partial refunds reverse order-earned loyalty points proportionally against the
cumulative processed amount. The final full refund reverses any remaining order,
referral, and redemption effects exactly once. A refund of an unshipped `PAID`
order releases stock during finalization; a delivered refund does not assume
that returned goods have passed inspection or are restockable.

Return authorization, reverse pickup, inspection, and quantity-level restocking
remain Phase 12D. This ledger is the money movement foundation for that workflow.

## Verification

- Policy tests cover balance reservation, failed-intent release, status mapping,
  stable request hashes, and bounded backoff.
- Webhook tests cover strict entity validation, correlation, event/status
  agreement, and pending creation.
- Razorpay tests cover stable POST idempotency, terminal failure parsing, and GET
  reconciliation.
- `npm run smoke:refund-ledger` uses PostgreSQL to prove partial + full
  accumulation, replay safety, over-refund rejection, provider pending recovery,
  concurrent reservation safety, order/payment finalization, and recovery from a
  lost provider response using the same key.

## Operations

For an intent stuck in reconciliation:

1. compare intent amount/payment/refund ids with the Razorpay dashboard;
2. use “Check provider now” rather than creating a second refund;
3. inspect its `RefundEvent` timeline and webhook audit record;
4. alert engineering if provider state conflicts with immutable local values;
5. never update `Order.status` or `Payment.status` manually to bypass the ledger.

Rollback is application-safe after the migration because the new tables are
additive. Do not drop them: an older application can ignore them, while operators
retain the evidence needed to reconcile in-flight refunds.
