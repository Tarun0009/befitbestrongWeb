# Serviceability, COD, and admin order notifications

Status: implementation plan for the first Delhi NCR operating area.

## Product outcome

Customers can check delivery with a six-digit PIN before checkout. Checkout is allowed only for active service areas. Eligible customers can choose prepaid or cash on delivery (COD). If an area is not supported, the customer can register interest and the admin can see aggregated demand for expansion planning. Admins receive a persistent, per-admin notification when a prepaid order is captured or a COD order is placed.

## Source of truth and rollout boundary

- `ServiceArea` is the only operational source of truth. City text and PIN prefixes never grant delivery eligibility.
- Initial operating zones are `DELHI`, `NOIDA`, and `GHAZIABAD`.
- PIN rows are maintained as an explicit allow-list. The import source should be the Department of Posts directory published through India's Open Government Data platform, then reviewed by operations before activation.
- Product pages may show a helpful availability check, but checkout repeats the check on the server immediately before stock is reserved.
- Existing prepaid orders remain valid. The migration gives existing orders `PREPAID` as their payment method.

## Customer journeys

### Supported PIN

1. Customer enters a six-digit PIN.
2. API returns the normalized city/zone, delivery estimate, prepaid availability, COD availability, COD fee, and COD limit.
3. Checkout stores the same PIN in the immutable address snapshot.
4. The server re-checks the active service-area row before calculating final payment choices.
5. Customer selects prepaid or COD.

### Unsupported PIN

1. API returns `serviceable: false`; it does not guess from city text.
2. The UI offers “Request delivery in my area”.
3. An authenticated user's account email is used; a guest supplies an email.
4. A request is de-duplicated per PIN and requester, so repeated clicks do not inflate demand.
5. Admin sees request counts, unique requester counts, and most recent request time by PIN.

### Prepaid order

1. A `PENDING` order reserves stock and creates a Razorpay order.
2. Browser success is informational only.
3. A verified server-side capture event transitions the order to `PAID`.
4. The same database transaction creates one idempotent `ORDER_PAID` admin notification.
5. Fulfilment may proceed from `PAID` to `SHIPPED` to `DELIVERED`.

### COD order

1. The server verifies the service area has COD enabled and the final amount does not exceed its configured limit.
2. A COD order and its stock reservation are committed atomically with status `CONFIRMED` and a `CREATED` payment record whose provider is `cod`.
3. The same transaction creates one `ORDER_COD_PLACED` admin notification.
4. The cart is cleared only after the order transaction succeeds.
5. Fulfilment may proceed from `CONFIRMED` to `SHIPPED` to `DELIVERED`; delivery marks the COD payment `CAPTURED`.
6. Cancellation before shipment releases stock. COD returns/refunds are recorded as an explicit manual operations flow, not sent to Razorpay.

## Order states

```text
PREPAID: PENDING -> PAID -> SHIPPED -> DELIVERED
COD:                CONFIRMED -> SHIPPED -> DELIVERED

PENDING   -> CANCELLED | FAILED
CONFIRMED -> CANCELLED
PAID      -> REFUNDED
DELIVERED -> REFUNDED
```

`paymentMethod` identifies `PREPAID` versus `COD`; order status is never set to `PAID` for uncollected COD money.

## Data model

- `ServiceArea`: PIN, zone, city/state, active flags, payment-method flags, COD limit/fee, delivery-day estimate.
- `ServiceAreaRequest`: PIN, requester hash, optional contact/user/product context, source and timestamp.
- `Order.paymentMethod`: `PREPAID` or `COD`.
- `AdminNotification`: idempotent business event linked to an order.
- `AdminNotificationReceipt`: per-admin read timestamp so one admin cannot hide an alert from another.

## API contract

Public/customer:

- `GET /serviceability/:pincode`
- `POST /serviceability/requests`
- `POST /checkout/session` with `paymentMethod`

Admin:

- `GET /admin/service-areas`
- `POST /admin/service-areas`
- `PATCH /admin/service-areas/:id`
- `GET /admin/service-area-demand`
- `GET /admin/notifications`
- `POST /admin/notifications/:id/read`
- `POST /admin/notifications/read-all`

## Non-negotiable invariants

- PIN is normalized and validated as exactly six digits at every boundary.
- Client-provided city, price, COD eligibility, fees, and totals are never trusted.
- Serviceability is checked before any stock decrement or provider call.
- A captured-payment event and a COD placement each create at most one admin notification.
- Notification read state is per admin.
- A repeated unsupported-area request by the same requester and PIN is idempotent.
- Cancelling an unshipped order restores each reserved variant exactly once.
- Razorpay refund calls are never attempted for a COD payment.
- No fulfilment automation is triggered by the browser's payment-success callback.

## Security and operations

- Public request capture is rate-limited and returns the same accepted response for new and duplicate requests.
- Request emails are used for expansion/contact consent only and are not exposed in aggregate admin lists by default.
- Admin routes retain Firebase authentication and `ADMIN` role enforcement.
- Admin notifications are persisted in PostgreSQL; UI polling improves freshness but is not the source of truth.
- Email is a secondary alert committed through the durable transactional outbox. Dashboard notifications and order records remain available if provider delivery fails.
- Coverage changes are reversible per PIN with `active`, `prepaidEnabled`, and `codEnabled` flags.

## Acceptance checks

- A supported PIN reports correct payment options and estimate.
- An unsupported PIN cannot create either a prepaid or COD order.
- An unsupported request is de-duplicated and appears in admin demand aggregation.
- COD above the configured limit is rejected without reserving stock.
- A valid COD order is `CONFIRMED`, has provider `cod`, appears in admin orders, and creates an unread alert.
- A paid webhook creates one alert even when delivered more than once.
- One admin reading an alert does not mark it read for other admins.
- Existing prepaid checkout, guest order access, coupons, bundles, loyalty, stock release, and Razorpay webhook processing still pass build and tests.

## Follow-up hardening before public COD launch

- Phone OTP verification and configurable customer/order risk rules.
- Automatic expiry for abandoned prepaid reservations.
- Courier partner serviceability and shipment webhooks layered on top of the internal allow-list.
- Return-to-origin, partial refund, and COD remittance reconciliation workflows.
- Transactional email/SMS channel preferences and SMS delivery infrastructure. Email outbox delivery is complete.

