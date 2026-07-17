# Razorpay HTTP Reliability Policy

## Problem

An outbound payment request without a deadline can hold a checkout or admin
request indefinitely. Blindly retrying a timed-out POST is worse: the provider
may have committed the first request even though our response was lost, which
can create duplicate orders or duplicate refunds.

The retry decision must therefore combine transport policy with an operation's
idempotency boundary.

## Decision

Every Razorpay request has a per-attempt `AbortSignal` deadline and a bounded
attempt count. Defaults are:

| Setting | Default | Allowed range |
| --- | ---: | ---: |
| `RAZORPAY_HTTP_TIMEOUT_MS` | 5000 ms | 500–30000 ms |
| `RAZORPAY_HTTP_MAX_ATTEMPTS` | 3 | 1–5 |
| `RAZORPAY_HTTP_RETRY_BASE_MS` | 250 ms | 50–2000 ms |

Retries use exponential equal jitter, capped at 2000 ms. A valid `Retry-After`
header is honored but capped to the same limit. The default worst-case request
budget is about 19 seconds when both retry delays reach the cap; normal
exponential jitter is lower.

The client retries only:

- network errors and per-attempt timeouts;
- HTTP `408`, `409`, `425`, and `429`;
- HTTP `500`, `502`, `503`, and `504`.

Other 4xx responses stop immediately. Final transport outcomes map to stable API
errors: timeout → `504 payment_gateway_timeout`; network/rate-limit/transient
provider failure → `503 payment_gateway_unavailable`; permanent provider
rejection → `502 payment_gateway_error`.

Razorpay recommends backoff with randomization for `429` responses. See
<https://razorpay.com/docs/api/understand/>.

## Create-order safety

`POST /orders` uses the local `Order.id` as Razorpay `receipt`. Razorpay requires
the receipt to be unique and supports filtering orders by receipt:

- <https://razorpay.com/docs/api/orders/create/>
- <https://razorpay.com/docs/api/orders/fetch-all/>

That unique provider key makes a POST retry duplication-safe. If the first POST
committed but its response was lost, a retry can return a duplicate-receipt 400.
The client then performs a bounded GET by receipt and accepts exactly one exact
match only after its amount, currency, and receipt match the local request.

The same lookup runs after exhausted transport failure. This also repairs a
process crash after provider creation but before `Order.providerOrderId` was
persisted: checkout resume repeats the stable receipt and recovers the original
provider order instead of creating another one.

## Refund safety

Every refund sends both:

```text
X-Refund-Idempotency: refund_<stable-random-intent-key>
```

and the same value as the refund receipt. The request body and key remain
identical across transport retries, concurrent admin requests, and a replay
after provider success followed by a local database failure. Razorpay explicitly
documents this header as the safe way to retry normal refunds, including `409`
while the original request is still processing:
<https://razorpay.com/docs/api/refunds/normal-refunds-idempotent/>.

Each durable `RefundIntent` owns a unique provider key for its entire lifetime.
Full and partial intents therefore retry independently without colliding.

## Response and logging policy

Successful order/refund responses are runtime-checked for identifiers, amount,
currency, receipt, and supported state before use. A mismatch returns
`payment_gateway_contract_error` and does not change local commercial state.

Logs contain operation, attempt, bounded delay, HTTP status, and Razorpay's safe
error classification fields. Raw response bodies, credentials, Authorization
headers, and customer/payment metadata are not logged.

## Verification

`backend/tests/razorpay.test.ts` proves:

- capped `Retry-After` handling and eventual success;
- timeout followed by duplicate-receipt recovery;
- a stable refund idempotency key and identical body across `409` retry;
- exact attempt exhaustion and the resulting `504`;
- permanent 4xx rejection is not retried;
- invalid refund idempotency keys fail before network I/O;
- refund GET reconciliation validates id/payment/amount and accepts provider
  `failed` as a terminal ledger outcome.

Environment tests enforce all configuration bounds. Full backend tests and both
production builds remain release gates.

## Rollout and rollback

No database migration is required. Deploy the new environment variables with
the application; omitted values use the documented defaults. Rollback is an
application-only rollback, though keeping the bounded settings in deployment
configuration is harmless.

## Residual risk

Refund provider outcomes are now represented by the durable ledger documented in
[`REFUND_LEDGER.md`](./REFUND_LEDGER.md). Signed refund webhooks and bounded polling
recover lost responses. Provider UAT and centralized alerts remain launch gates.
