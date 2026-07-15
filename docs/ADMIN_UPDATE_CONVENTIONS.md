# Admin update API conventions

This project uses explicit saves for operational data. Product prices, stock,
payment rules, fulfillment coverage, and promotions are not autosaved.

## HTTP semantics

| Operation | Method | Payload rule |
| --- | --- | --- |
| Create a resource | `POST` | Complete create contract |
| Change independent fields | `PATCH` | Changed fields only |
| Replace one atomic aggregate | `PUT` | Complete replacement contract |
| Run an action or state transition | `POST` | Command-specific input |

Bundles remain `PUT` resources because pricing, dates, and component quantities
must be validated and replaced together. Products, variants, categories,
coupons, homepage configuration, loyalty configuration, subscription plans, and
service areas use `PATCH`.

## Frontend rules

1. Normalize form values into their API representation before comparison.
2. Build a shallow patch with `buildChangedFields`.
3. Disable Save when no normalized values changed.
4. Send `null` when an optional stored value is being cleared. Do not use
   `undefined`, because JSON omits it.
5. Keep one explicit Save action for business-sensitive forms. Small toggles may
   save immediately when their intent is unambiguous.
6. Display mutation failures and prevent duplicate writes while one is pending.
7. Use cache invalidation or an explicit refetch, never both for the same save.

## Backend rules

1. PATCH schemas are strict and reject unknown fields.
2. Empty PATCH bodies are rejected before any database or cache work.
3. Cross-field rules are validated against the merged current resource.
4. Only the supplied patch is passed to Prisma after merged validation.
5. Existing `PUT` endpoints remain available where replacement semantics are
   intentional or required for compatibility.

## Concurrency

Focused patches prevent one admin from overwriting unrelated fields changed by
another admin. Concurrent edits to the same field currently use last-write-wins.
If multi-admin editing becomes frequent, add an `updatedAt` precondition and
return `409 Conflict` for stale forms.

## Regression checklist

- An unchanged form sends no request.
- A one-field edit sends exactly that field.
- Clearing a nullable field persists `null`.
- Unknown and empty patches return validation errors.
- Cross-field validations still run for partial service-area changes.
- Create, delete, transitions, and aggregate replacement flows are unchanged.
