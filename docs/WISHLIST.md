# Wishlist & Back-in-Stock Alerts

Phase 10D adds persistent customer intent signals while keeping account data
isolated and inventory notification rules explicit.

## Customer features

- Save or remove products from shared product cards and product detail pages.
- Optimistic controls update immediately and roll back on API failure.
- Saved products are available at /account/wishlist.
- The account page and desktop header show direct wishlist access and counts.
- Customers can select an unavailable variant and request an email alert.
- Active stock alerts are managed beside the wishlist.

## Trust and data rules

- Wishlist and stock-alert endpoints require Firebase authentication.
- User ownership comes exclusively from the verified backend auth context.
- Frontend RTK caches are keyed by Firebase UID so cached data cannot cross
  account boundaries.
- Wishlist and stock-alert uniqueness is enforced in PostgreSQL.
- Alerts can only be created for active products whose selected variant is
  currently unavailable.
- Product and variant deletion cascades to stale intent records.

## Feature layout

    backend/src/modules/wishlist/
    ├── wishlist.service.ts
    ├── wishlist.routes.ts
    ├── stockAlerts.service.ts
    ├── stockAlerts.routes.ts
    ├── stockAlertPolicy.ts
    ├── stockAlertEmail.service.ts
    └── adminDemand.routes.ts

    frontend/src/features/wishlist/
    ├── wishlistApi.ts
    ├── WishlistButton.tsx
    └── StockAlertButton.tsx

Customer page: /account/wishlist
Admin page: /admin/demand

## API

| Method | Route | Access | Purpose |
|---|---|---|---|
| GET | /wishlist | Customer | Hydrated wishlist and saved product IDs |
| POST | /wishlist/:productId | Customer | Idempotently save a product |
| DELETE | /wishlist/:productId | Customer | Remove a saved product |
| GET | /stock-alerts | Customer | Active variant alerts |
| POST | /stock-alerts/:variantId | Customer | Idempotently create an unavailable-variant alert |
| DELETE | /stock-alerts/:variantId | Customer | Remove an alert |
| GET | /admin/demand | Admin | Wishlist and restock demand aggregates |

## Restock notification rule

An email run is eligible only when admin inventory crosses from zero or below to
a positive value. Normal in-stock edits and repeated zero values do not notify.

The admin stock update succeeds even if the optional email adapter fails. Failed
emails stay active for a later retry; successfully sent alerts are marked inactive
with notifiedAt. If Resend is not configured, demand continues to be collected and
the admin dashboard shows that delivery is paused.

Required optional environment values:

- RESEND_API_KEY
- EMAIL_FROM
- FRONTEND_URL

## Verification

- Migration 20260713110000_wishlist_stock_alerts applied
- Backend and frontend TypeScript checks passed
- Backend production TypeScript build passed
- 25 Jest tests passed, including stock-transition policy tests
- Self-cleaning database lifecycle verified:
  - wishlist add is idempotent
  - stock-alert add is idempotent
  - in-stock alert creation is rejected
  - admin demand counts are correct
  - wishlist and alert removals succeed
- Protected endpoints returned 401 without authentication
- Shop, product, account wishlist, and admin demand pages and chunks returned 200
