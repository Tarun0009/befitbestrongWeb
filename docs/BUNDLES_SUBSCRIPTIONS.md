# Bundles and Subscriptions

Phase 10F adds two retention features with different accounting boundaries: a bundle is an immediate checkout price, while a subscription is a future schedule and reminder. Neither client input nor a background job is allowed to invent a price, charge a customer, or oversell stock.

## Bundles

### Identity in the cart

A bundle is stored in a separate Redis hash next to the existing variant cart:

```text
cart:user:{userId}:bundles
cart:guest:{sessionId}:bundles
```

Each field is `bundleId -> quantity`. The cart rehydrates bundle definitions, current component prices, product state, and stock from PostgreSQL on every read. Deleted, inactive, expired, invalidly priced, or unavailable bundles self-heal out of Redis. Guest-to-user merge sums bundle quantities and caps them at current component availability.

Keeping bundle identity is important. Expanding a bundle into ordinary variant lines in Redis would lose the price contract and could incorrectly discount individually added products.

### Pricing and availability

Admins configure either a fixed bundle price or percentage saving. The server calculates:

```text
component total = sum(current variant price × required quantity)
bundle availability = min(floor(variant stock / required quantity))
```

A bundle must contain at least two different variants and produce a positive current saving. Scheduled start/end dates and active product state are enforced server-side.

### Checkout accounting

The cart exposes both retail and payable merchandise totals. Checkout recalculates them and persists:

- `Order.subtotal`: full component retail value;
- `Order.bundleDiscount`: bundle saving;
- `Order.couponDiscount`: coupon saving after bundle pricing;
- `Order.discount`: the combined discount;
- `OrderItem`: normal component lines with a bundle snapshot in `productSnapshot`.

Coupon minimums and discounts use the already-discounted merchandise total. Stock requests from individual and bundled lines are aggregated by variant before atomic `UPDATE ... WHERE stock >= quantity` reservations. Cancellation and failed payment release the ordinary component order items through the existing state machine.

### API and UI

Public:

- `GET /bundles`
- `GET /bundles/:slug`
- `POST/PATCH/DELETE /cart/bundles...`
- storefront at `/bundles`

Admin:

- `GET/POST /admin/bundles`
- `PUT/DELETE /admin/bundles/:id`
- editor at `/admin/bundles`

## Subscriptions

### Enrollment boundary

A customer can enroll only from an owned order in `PAID`, `SHIPPED`, or `DELIVERED` state that contains the exact variant attached to the plan. This supplies a verified product relationship, contact email, and immutable shipping snapshot without introducing an unfinished address-book dependency.

At enrollment the plan name and discount percentage are snapshotted. Later admin changes affect new subscribers but do not silently rewrite existing agreements.

### Customer controls

Customers manage schedules at `/account/subscriptions`:

- pause an active schedule;
- resume a paused schedule;
- skip exactly one upcoming date, with a `SKIPPED` renewal record;
- permanently cancel a schedule.

Product details advertise eligible frequencies. Paid order items expose the actual enrollment control. Duplicate active/paused enrollment for the same plan is rejected.

### Renewal processing

An hourly BullMQ worker scans at most 100 due active subscriptions. A compare-and-swap update on `(id, nextOrderAt, ACTIVE)` ensures an admin-triggered scan and worker cannot both process the same schedule.

For each claimed schedule it creates one unique renewal record:

- `READY` when the plan/product is active and current stock covers the quantity;
- `STOCK_BLOCKED` otherwise.

The worker snapshots current unit price, the subscriber's preserved discount, discounted price, quantity, and scheduled date. It then advances `nextOrderAt` by the subscriber's frequency.

Renewal processing deliberately does not decrement inventory or charge a payment instrument. A reminder is an invitation to review and check out; the normal checkout transaction remains the only stock-reservation and payment boundary. Optional Resend email is sent when configured.

### API and UI

Public/customer:

- `GET /subscription-plans?variantId=...`
- `GET/POST /subscriptions`
- `POST /subscriptions/:id/pause|resume|skip|cancel`
- customer page at `/account/subscriptions`

Admin:

- `GET /admin/subscriptions`
- `POST /admin/subscription-plans`
- `PUT/DELETE /admin/subscription-plans/:id`
- `POST /admin/subscriptions/process-due`
- console at `/admin/subscriptions`

Plans with subscriber history cannot be deleted; admins deactivate them instead.

## Verification

- Migrations: `20260713170000_bundles` and `20260713173000_subscriptions`
- Pure policy tests cover fixed/percentage bundle price, availability, subscription discount rounding, and schedule dates.
- `scripts/bundleLifecycle.smoke.ts` proves Redis bundle identity, current pricing, component stock reservation, order discount snapshots, cart clearing, and exact cancellation release.
- `scripts/subscriptionLifecycle.smoke.ts` proves paid-order eligibility, rate snapshotting, pause/resume/skip/cancel, ready and stock-blocked renewal records, scan replay safety, and cancelled-schedule exclusion.
- Both lifecycle scripts remove their PostgreSQL/Redis fixtures.