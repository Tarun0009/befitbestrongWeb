# Durable Transactional Email Outbox

## Problem

Email is an external side effect. Sending it inside an order, subscription, or
inventory request creates two unsafe failure windows: the provider can accept a
message before the database transaction rolls back, or the database can commit
before the provider call fails. Fire-and-forget calls also lose messages on process
restart and provide no operator recovery path.

## Decision

The application commits a frozen `EmailOutbox` message in the same PostgreSQL
transaction as the business change. A BullMQ scan wakes the database-backed worker;
Redis schedules work but is not the source of truth.

```text
business transaction
  ├─ update order / renewal / stock
  └─ insert frozen EmailOutbox + audit event
             |
             v
      periodic BullMQ scan
             |
             v
       lease due database row
             |
             v
       Resend API with stable key
        ├─ accepted -> SENT
        ├─ transient -> PENDING + backoff
        ├─ permanent/exhausted -> DEAD_LETTER
        └─ source removed -> CANCELLED
```

## Invariants

- Producers supply a stable application idempotency key. A transaction-scoped
  PostgreSQL advisory lock serializes concurrent producers for that key.
- Replaying the same key and content returns the existing row. Reusing a key with
  different frozen content returns `409 email_idempotency_conflict`.
- Recipient, sender, subject, and HTML are frozen at commit time. Later catalog or
  address edits cannot rewrite historical intent.
- The random provider idempotency key is created once and retained across automatic
  and admin retries.
- Claiming increments the attempt count and creates a two-minute processing lease.
  An expired lease is recoverable after worker/process failure.
- Provider calls have an eight-second default deadline. Retryable transport, 408,
  429, 5xx, and concurrent-idempotency failures back off from one minute to one hour
  and honor a bounded `Retry-After` value.
- Permanent provider validation failures, or exhaustion of the configured attempt
  limit, move to `DEAD_LETTER`; failures never disappear silently.
- A stock-alert message is cancelled before delivery if the alert was removed or
  superseded. A successful delivery atomically deactivates that alert. A successful
  renewal message atomically records `notifiedAt`.
- `SENT` means the provider accepted the request; it does not prove inbox delivery.

## Producers

| Template | Transaction boundary | Application key |
|---|---|---|
| `ORDER_STATUS` | Order state transition or COD creation | order + status |
| `ADMIN_ORDER_ALERT` | Paid/COD admin notification creation | event type + order |
| `SUBSCRIPTION_RENEWAL` | Renewal record and schedule advance | renewal ID |
| `BACK_IN_STOCK` | Admin stock crossing from zero to positive | alert ID + alert version |

The persistent in-app admin notification remains the primary order-operations
signal. Email is a secondary channel.

## Configuration

```text
RESEND_API_KEY=
EMAIL_FROM=orders@example.com
ADMIN_NOTIFICATION_EMAIL=operations@example.com
EMAIL_DELIVERY_REQUIRED=true
EMAIL_HTTP_TIMEOUT_MS=8000
EMAIL_OUTBOX_SCAN_SECONDS=30
EMAIL_OUTBOX_BATCH_SIZE=25
EMAIL_OUTBOX_MAX_ATTEMPTS=8
```

When Resend is optional and unconfigured, producers still commit `PENDING` rows and
the worker leaves them untouched. If email is required, environment validation and
readiness require both provider values.

## Operations

Admins use `/admin/email-delivery` to filter delivery records, see queue totals and
the latest immutable events, inspect errors, and requeue `PENDING` or
`DEAD_LETTER` rows. The UI intentionally does not expose stored HTML, application
keys, provider credentials, or provider idempotency keys.

API:

- `GET /admin/email-outbox?page=1&limit=25&status=&template=`
- `POST /admin/email-outbox/:id/retry`

Operator response:

1. If provider configuration is missing, restore `RESEND_API_KEY` and `EMAIL_FROM`,
   restart the backend, and confirm readiness before retrying messages.
2. For 429/5xx/transport errors, normally allow bounded automatic retries. Check
   provider status and queue age before forcing a retry.
3. For recipient/domain validation failures, correct the source/customer data for
   future messages. Frozen historical content is not edited; requeue only when the
   identical request can succeed.
4. Investigate repeated `DEAD_LETTER` records before bulk action. There is no bulk
   retry endpoint by design.
5. Keep the order/admin dashboard as the operational source of truth even when
   email is degraded.

## Verification

- Policy tests cover content hashing, bounded exponential delay, `Retry-After`, and
  provider-key constraints.
- Provider contract tests cover request headers/body, rate limits, 409 semantics,
  permanent validation errors, malformed responses, and hard timeouts.
- `pnpm smoke:email-outbox` uses PostgreSQL to verify concurrent replay, transaction
  rollback, transient recovery, dead-letter retry, expired-lease recovery, atomic
  order enqueue, and stock-alert unsubscribe cancellation.

## Deployment and rollback

Migration `20260716230000_email_outbox` is additive. Deploy migration first, then
the application. Rolling back the application leaves durable rows intact; do not
drop the tables during an incident. A forward corrective release can resume them.

## Residual risk

- Provider delivery/bounce/complaint webhooks and suppression handling are not yet
  persisted; `SENT` is provider acceptance only.
- Queue-age/dead-letter alerting and a separately scalable worker process belong to
  Phase 13D.
- Resend's provider idempotency window is 24 hours. Normal retries complete well
  inside it, but a provider-accepted response lost immediately before a day-long
  outage could later be sent twice. Provider-event reconciliation is the planned
  hardening for that rare boundary.
