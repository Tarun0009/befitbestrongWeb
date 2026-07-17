# Checkout Reservation Expiry — Design Review

## Problem

Prepaid checkout reserves stock before calling Razorpay. If the customer closes
the payment modal or never returns, the Order remains `PENDING`; without an
expiry path, inventory and coupon capacity remain locked forever.

## Decision

Every prepaid order receives an explicit `reservationExpiresAt` timestamp.
The default window is 15 minutes and is bounded to 5–60 minutes by environment
validation. COD orders do not receive a payment-reservation deadline because
they are confirmed immediately.

A BullMQ repeatable job scans every 60 seconds in batches of 50 by default. All
three values are configuration, so operations can tune them without a code
release:

- `CHECKOUT_RESERVATION_MINUTES`
- `CHECKOUT_EXPIRY_SCAN_SECONDS`
- `CHECKOUT_EXPIRY_BATCH_SIZE`

The `(status, reservationExpiresAt)` PostgreSQL index keeps the due-order query
bounded as the order table grows.

## Exactly-once transaction

The scanner does not update orders directly. It routes each due order through
the shared order state machine and transitions `PENDING → CANCELLED` with the
history note `checkout reservation expired`.

One PostgreSQL transaction performs all work:

1. conditionally marks `reservationExpiredAt` only while the order is still due
   and PENDING;
2. restores every OrderItem quantity to its ProductVariant;
3. returns usage for ordinary promotional coupons;
4. leaves a loyalty coupon consumed and restores its points through the unique
   loyalty-ledger idempotency key;
5. marks the Payment row `FAILED`;
6. changes Order status to `CANCELLED` with an optimistic status condition;
7. writes one OrderStatusHistory row.

If another worker, customer cancellation, payment failure, or webhook wins the
status race, the losing transaction rolls back every side effect. Multiple API
instances can therefore run scanners without double-restoring anything.

## Coupon versus loyalty rule

Normal promotion usage is decremented on unpaid `CANCELLED` or `FAILED`
transitions. Loyalty coupons are intentionally different: their one-time coupon
stays consumed while the original points are restored. Restoring both coupon
usage and points would give the customer the same value twice.

This shared state-machine behavior also fixes the existing manual-cancellation
and payment-provider-failure paths, not only scheduled expiry.

## Verification

`smoke:checkout-expiry` uses real PostgreSQL and Redis. It creates a guest order
with a normal coupon and an authenticated order with a loyalty coupon, then runs
two scanners concurrently and verifies:

- both orders are cancelled and marked expired once;
- inventory returns to its exact opening value;
- the normal coupon usage is restored;
- the loyalty coupon remains consumed while points return once;
- payments are FAILED and each order has one expiry history record;
- a later scan has zero candidates and changes no balances.

CI runs this smoke after migrations and unit tests using disposable PostgreSQL 16
and Redis 7 services.

## Remaining payment boundary

A captured Razorpay payment racing the exact expiry instant can still require
provider reconciliation. The database transaction guarantees one local winner;
the next Phase 13B slice will validate provider order/amount/currency/state and
reconcile provider-versus-database drift.
