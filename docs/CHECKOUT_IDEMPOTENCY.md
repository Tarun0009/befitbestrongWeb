# Checkout Idempotency — Design Review

## Problem

A customer can submit checkout more than once because of a double-click, mobile
network retry, proxy retry, browser refresh, or a lost HTTP response. Stock
reservation was already atomic, but each request previously created a different
order and decremented stock again.

## Contract

`POST /checkout/session` requires an `Idempotency-Key` containing 32–128
URL-safe characters. The browser generates 256 random bits and reuses that key
only while retrying the same checkout payload.

- First successful request: `201 Created`.
- Completed replay: `200 OK` with the original order/payment session and
  `Idempotency-Replayed: true`.
- Same owner/key with different checkout details: `409
  idempotency_key_reused`.
- A concurrent request while the first owns the processing lease: `409
  checkout_in_progress`; the client retains the same key and may retry.
- A recorded failure is replayed instead of creating another order. A deliberate
  new attempt receives a new key.

## Persistence and privacy

`CheckoutAttempt` stores SHA-256 digests of the cart-owner identity and client
key, a canonical request hash, status, processing lease, optional order link,
and safe failure fields. Raw customer keys and raw guest cart identifiers are
not stored.

The `(ownerHash, keyHash)` unique constraint is the concurrency authority. Two
requests can validate at the same time, but only one can own the attempt. Order
creation, stock reservation, coupon consumption, order history, and linking the
attempt to the order commit in the same PostgreSQL transaction.

For guest checkout, the high-entropy key also serves as the recoverable guest
order token. The Order stores only its SHA-256 hash. This allows a lost response
to be replayed without weakening the existing hashed-token storage design.

## Processing lease and recovery

An attempt starts as `PROCESSING` with a two-minute lease. A fresh concurrent
request is told to retry. If a process dies, a later request can atomically
reclaim the expired lease:

- no linked order: restart the local checkout transaction;
- linked COD order: reconstruct and complete the response;
- linked prepaid order with provider/payment link: reconstruct the response;
- linked PENDING prepaid order without a provider link: resume provider setup;
- terminal order: fail safely rather than create another order.

No database transaction is held open during the Razorpay network call.

## Verification

`smoke:checkout-idempotency` uses real PostgreSQL and Redis. It sends two
concurrent requests for one guest cart/key and asserts:

1. at least one request succeeds while the other succeeds as a replay or reports
   processing;
2. one CheckoutAttempt links to one Order;
3. one OrderItem exists and stock decrements exactly once;
4. a later retry returns the same order and guest token;
5. changing the address while reusing the key is rejected.

CI provisions disposable PostgreSQL 16 and Redis 7 services, applies migrations,
runs the normal tests, and then runs this database-backed smoke.

## Remaining boundary

The local-order guarantee is complete. A process crash after Razorpay accepts an
order but before the provider ID is persisted can still require provider-side
reconciliation. Phase 13B will address that boundary with provider timeouts,
reconciliation records, and recovery jobs rather than holding a database lock
across the network call.
