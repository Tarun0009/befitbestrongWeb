# Loyalty, Referrals, and Retention

Phase 10E adds a refund-safe rewards program without making a mutable balance the source of truth. Every change is represented by an append-only `LoyaltyEntry`; `User.pointsBalance` is a denormalized total updated in the same database transaction for fast account reads.

## Customer flow

1. A customer receives a stable referral code from `GET /loyalty`.
2. A new customer may apply one code before their first paid order.
3. When an order transitions to `PAID`, the state machine records order points once. If this is a referred customer's qualifying order, both referral bonuses are recorded once.
4. The customer can exchange an eligible point amount for a private, assigned, one-use fixed-amount coupon.
5. Existing checkout coupon validation enforces ownership and atomically consumes the coupon.
6. A refund reverses the exact entries created by that order. A cancelled, failed, or refunded reward-coupon order restores the redeemed points once; the consumed coupon remains spent.

The account UI is at `/account/rewards`. It shows the current balance, earning/redemption rules, referral code and attribution state, referral counts, redemption preview, generated coupon, and the latest 30 ledger entries.

## Data model

- `LoyaltyConfig` is a singleton containing the active flag, earn rate, redemption rate/minimum/maximum, both referral bonuses, and reward-coupon validity.
- `LoyaltyEntry` stores a signed point value, entry type, description, optional order/coupon/referral references, metadata, and a unique `idempotencyKey`.
- `Referral` has one unique referred customer, an optional unique qualifying order, a status, and bonus snapshots.
- `Coupon` supports an optional assigned user, maximum usage count, usage counter, and source.
- `User` stores the cached balance, net lifetime earned/redeemed totals, and a unique referral code.

## Accounting invariants

### Paid orders

Points are awarded only through the order state machine when an order reaches `PAID`:

```text
points = floor(order total in rupees) × earnPointsPerRupee
idempotency key = loyalty:order:earn:{orderId}
```

The transition itself is idempotent, and the unique ledger key is a second database-level guard.

### Refunds

A refund reads the original positive order/referral entries and appends their exact negative counterparts. It does not recalculate using today's configuration. Referral bonus amounts are snapshotted when awarded, so later configuration changes cannot alter a historical reversal.

A customer can have a negative balance after spending points and then refunding the order that earned them. This is intentional accounting behavior: future earnings offset the debt, while redemption requires a sufficient non-negative balance.

### Redemption

Redemption validates the program state, configured minimum/maximum, exact conversion increment, and current balance. Coupon creation, the negative ledger entry, and the guarded balance decrement occur in one transaction. If the balance changed concurrently, the entire transaction rolls back.

Checkout validates `assignedUserId` and uses an atomic `UPDATE ... WHERE usedCount < maxUses`; concurrent attempts cannot consume the same reward twice. Generated loyalty coupons are excluded from manual marketing-coupon administration.

### Cancellation restoration

`CANCELLED`, `FAILED`, and `REFUNDED` transitions look for the matching negative redemption entry. A unique key containing the order and coupon ensures restoration happens once even if the transition is replayed. The coupon is not reactivated, preventing both restored points and a reusable discount from existing at the same time.

## Referral protections

- One referral attribution per referred customer (`referredUserId` is unique).
- Codes must be applied before any paid, shipped, delivered, or refunded order history.
- Self-referrals are rejected.
- Invalid codes do not reveal a customer account.
- Bonuses remain pending until the referred customer's first `PAID` transition.
- A refund of the qualifying order reverses both snapshotted bonuses and cancels the referral.

These controls prevent common attribution and replay mistakes. Production fraud controls such as device, payment-instrument, address, and campaign velocity analysis remain a separate risk system.

## API surface

Customer routes require Firebase authentication:

- `GET /loyalty`
- `POST /loyalty/referral` with `{ code }`
- `POST /loyalty/redeem` with `{ points }`

Admin routes require the `ADMIN` role:

- `GET /admin/loyalty`
- `PATCH /admin/loyalty/config`
- `POST /admin/loyalty/users/:userId/adjust`

The admin screen at `/admin/loyalty` shows program and referral totals, customer balances, configuration controls, append-only manual corrections with reasons, and recent ledger activity.

## Verification

- Prisma migration: `20260713140000_loyalty_referrals`
- Pure policy tests cover order rounding and exact redemption increments.
- The self-cleaning `scripts/loyaltyLifecycle.smoke.ts` scenario verifies:
  - duplicate `PAID` delivery does not duplicate entries;
  - referral and order rewards are reversed by refund;
  - a reward coupon rejects another user;
  - concurrent/repeated coupon consumption is rejected;
  - cancellation restores points exactly once;
  - test users, orders, coupons, and entries are removed afterward.