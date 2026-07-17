# Feature-Based Folder Structure

This is the repository rule for keeping product work easy to find, test, and
change without coupling unrelated areas.

## Backend rule

Business code belongs to `backend/src/modules/<feature>/`:

```text
modules/checkout/
  checkout.routes.ts       HTTP validation and response mapping
  checkout.service.ts      use-case orchestration and transactions
  checkoutExpiry.service.ts
  checkoutExpiry.policy.ts pure business decisions
```

Provider adapters stay with the feature that owns the contract, such as
`fulfillment/shiprocket.provider.ts`. Cross-cutting runtime infrastructure such as
the database, Redis, logging, queues, and generic middleware remains under
`config/`, `lib/`, and `middleware/`.

The backend currently follows this convention well. Checkout, payments, refunds,
orders, fulfillment, serviceability, loyalty, subscriptions, reviews, products,
and the other domains each own their routes, services, policies, and adapters.

## Frontend rule

Product-specific UI and data access belong to `frontend/src/features/<feature>/`:

```text
features/checkout/
  components/
  checkoutApi.ts
  checkout.types.ts
  useCheckout.ts
  index.ts
```

Use these boundaries:

- `app/` owns routing, metadata, layouts, and thin page composition.
- `features/<feature>/components/` owns feature-specific visual components.
- `features/<feature>/` owns API endpoints, state, hooks, types, and policies for
  that feature.
- `components/` contains only genuinely shared application UI used by multiple
  features.
- `lib/` contains framework and domain-neutral infrastructure only; new feature
  API files are forbidden there.
- E2E tests mirror their feature, such as `e2e/checkout/`; shared quality gates
  live under `e2e/quality/`.

## Current frontend migration debt

Newer areas such as serviceability, wishlist, reviews, subscriptions, discovery,
loyalty, bundles, notifications, and email delivery already follow the rule.
Several early files predate it:

- `lib/ordersApi.ts`
- `lib/cartApi.ts`
- `lib/catalogApi.ts`
- `lib/authApi.ts`
- `lib/siteConfigApi.ts`
- `lib/adminAnalyticsApi.ts`

These are explicit compatibility exceptions, not examples for new development.
Move them feature by feature: move one implementation, leave a temporary re-export
for existing imports, update consumers, run the complete regression gate, and only
then remove the bridge. Do not combine this migration with unrelated business
changes.

## Automated guard

`pnpm architecture:check` blocks new `*Api.ts` files in `src/lib` unless they are
listed as existing migration debt. It also blocks root-level E2E specifications so
new journeys must declare their feature ownership. CI runs this check on every pull
request.

This guard checks placement, not design quality. Reviewers must still ensure routes
stay thin, services own use cases, pure policies avoid I/O, and features communicate
through deliberate public contracts rather than deep imports.
