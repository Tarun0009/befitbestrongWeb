# Reviews & Ratings

Phase 10C adds moderated customer reviews without allowing public rating data to
drift away from the approved review set.

## Trust rules

- Authentication is required for eligibility and submission.
- The backend derives verified-purchase status; clients cannot send or override it.
- A matching DELIVERED order item is required. Matching uses both the current
  variant relation and the immutable order snapshot slug so historical orders
  remain eligible after catalog edits.
- A database unique constraint enforces one review per customer and product.
- Every new review starts as PENDING.
- Only APPROVED reviews are public and included in product aggregates.

## Feature layout

    backend/src/modules/reviews/
    ├── reviewPolicy.ts
    ├── reviews.service.ts
    ├── reviews.routes.ts
    └── adminReviews.routes.ts

    frontend/src/features/reviews/
    ├── reviewsApi.ts
    ├── RatingStars.tsx
    ├── ReviewComposer.tsx
    └── ProductReviews.tsx

The customer composer is reused on product pages and delivered order details.
The admin queue lives at /admin/reviews.

## API

| Method | Route | Access | Purpose |
|---|---|---|---|
| GET | /reviews/products/:slug | Public | Approved reviews, rating summary, distribution |
| GET | /reviews/products/:slug/eligibility | Customer | Delivered-purchase and existing-review status |
| POST | /reviews/products/:slug | Customer | Submit a pending verified review |
| GET | /admin/reviews | Admin | Filtered moderation queue |
| PATCH | /admin/reviews/:id/moderate | Admin | Approve or reject a review |

## Aggregate correctness

Product.ratingAvg and Product.ratingCount are read-optimized fields. An admin
moderation action updates the review and recomputes both values from all approved
reviews inside one database transaction. Pending and rejected reviews therefore
cannot affect storefront ratings, and moving an approved review back to rejected
removes it from the aggregate immediately.

Catalog and search cache keys were versioned for the new response shape. Moderation
also invalidates the catalog tag so product cards and detail pages receive the new
aggregate.

## Verification

- Prisma schema validation and migration deployment
- Backend and frontend TypeScript checks
- Backend production TypeScript build
- 22 Jest tests, including review eligibility policy coverage
- Self-cleaning database lifecycle smoke: delivered purchase → pending submission
  → approval aggregate → rejection aggregate
- Live HTTP smoke for public reviews, protected eligibility/admin routes, product
  page, and admin moderation page
