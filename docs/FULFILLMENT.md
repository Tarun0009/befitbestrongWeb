# Fulfillment, Shipment + Tracking

## Problem

An order status is not enough to operate delivery. A courier handoff needs its own
identity, AWB/tracking number, carrier, estimated delivery, and event history.
Storing those values directly on Order would also make split shipments and future
courier integrations difficult.

The most dangerous failure is a partial dispatch: an order marked SHIPPED without
a tracking record, or a tracking record created while the order remains paid.

## Phase 12A decision

Order remains the commercial state machine and Shipment owns physical delivery.
One order can have multiple shipments. Each shipment has append-only ShipmentEvent
records normalized to the platform's ShipmentStatus enum.

The first adapter is manual admin dispatch:

1. Validate carrier, tracking number, optional HTTPS/HTTP tracking link, service,
   estimated delivery, and note.
2. Start the existing order transition transaction.
3. Create the shipment and its initial IN_TRANSIT event inside that transaction.
4. Optimistically update Order.status from its previously-read state to SHIPPED.
5. Write the order history entry and commit everything together.

If any step fails, the database rolls back the shipment, event, status, and order
history together. The conditional status update also prevents two concurrent
operators from producing conflicting first-dispatch histories.

## State ownership

| Concern | Source of truth |
|---|---|
| Payment, cancellation, refund, customer order lifecycle | Order.status |
| Carrier handoff and parcel movement | Shipment.status |
| Commercial audit history | OrderStatusHistory |
| Courier/manual movement history | ShipmentEvent |
| COD collection | Payment.status, captured only on delivery |

Marking an order delivered updates all open shipments and appends delivery events
in the same transaction as the order transition. Legacy orders without a shipment
can still use the existing manual transition routes.

## API and user experience

- POST /admin/orders/:id/shipments creates the tracking record and dispatches a
  PAID or COD CONFIRMED order.
- Admin order detail shows the dispatch form, AWB, carrier tracking link, estimate,
  current shipment status, and latest event.
- Customer order detail returns only safe shipment fields and shows an event
  timeline plus the external carrier link.
- Tracking links accept only http or https; tracking numbers use a bounded,
  conservative character set.

## Phase 12B courier integration

Shiprocket is implemented behind a CourierProvider adapter. The admin confirms the
parcel weight and dimensions, requests courier serviceability/rates for the order's
delivery PIN and payment method, and may select a courier before booking.

Booking is resumable and persisted as CourierBooking:

1. Reuse a provider order matching the deterministic 20-digit external reference,
   or create it when none exists.
2. Assign the AWB, then create the local LABEL_CREATED shipment.
3. Generate the printable label and schedule pickup.
4. Persist each provider identifier before moving to the next step. A retry resumes
   from the last durable step instead of intentionally creating another booking.

The order does not become SHIPPED merely because a label exists. The courier pickup
event owns that transition. This prevents the storefront from claiming that a
parcel moved before physical handoff.

Shiprocket sends tracking updates to POST /webhooks/fulfillment. The route compares
the x-api-key token in constant time, persists the raw event using the existing
unique provider/event guard, and acknowledges before BullMQ performs state changes.
Provider status strings are normalized into ShipmentStatus values. Exact webhook
replays are ignored, and ShipmentEvent.externalEventId provides a second
idempotency boundary.

A half-hour reconciliation worker checks stale, non-terminal Shiprocket shipments
through the tracking API. Sync failures are visible in Admin → Fulfillment and can
be retried manually. Admins can also print labels and cancel eligible AWBs. Cancelling
an AWB deliberately does not cancel/refund the commercial order; that remains an
explicit order operation.

The manual dispatch path remains available when the courier API is unconfigured or
degraded.
