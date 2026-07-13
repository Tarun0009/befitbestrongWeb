# Discovery, SEO, Performance, and Accessibility

Phase 10G makes catalog pages easier to discover without turning customer browsing history into server-side tracking. It also establishes explicit crawler, motion, focus, image-loading, and modal behavior for the storefront.

## Search-engine contract

### Canonical metadata

`NEXT_PUBLIC_SITE_URL` is the public origin used for `metadataBase`, canonical URLs, sitemap entries, and robots directives. It defaults to `http://localhost:3005` locally and is passed through the frontend Docker build.

The root layout defines the site title template, description, Open Graph/Twitter defaults, application metadata, locale, large-image preview policy, and web manifest. `/shop`, `/bundles`, and every active product have route-specific titles, descriptions, canonical URLs, and share imagery. Account, auth, admin, cart, and checkout layouts emit `noindex, nofollow`.

### Product structured data

The server-side product layout fetches the current public catalog record and renders escaped JSON-LD for:

- `Product`, including brand, category, images, optional aggregate rating, and one `Offer` per exact variant;
- current variant price, currency, condition, and stock availability;
- `BreadcrumbList` for Home → Shop → Product.

Unavailable or inactive products do not emit sellable structured data and receive `noindex` metadata. Client product interactions remain in the existing page, so metadata cannot change cart, review, wishlist, variant, or subscription behavior.

### Crawler endpoints

- `/robots.txt` allows public catalog crawling, blocks private/transactional paths, and advertises the sitemap.
- `/sitemap.xml` is rendered dynamically and rehydrates the current active product slug list from the API.
- `/manifest.webmanifest` exposes install/display and brand-color metadata.

Share previews use current catalog imagery when present and a stable storefront image otherwise. Unsplash URLs are normalized to a 1200×630 crop. This avoids build-time image snapshots and a Next 15.1 Windows runtime-font issue in generated image responses.

## Recently viewed products

The browser stores at most 12 entries under `befitbestrong:recently-viewed:v1`:

```text
{ slug, viewedAt }
```

No user ID, email, product price, or inventory value is persisted. Invalid/duplicate entries are removed and storage failures are treated as an optional-enhancement failure.

`GET /discovery/recently-viewed?slugs=...` accepts the ordered slug list, caps and validates it again, then returns only current active catalog summaries in the same order. This prevents local storage from presenting stale price, rating, image, dispatch, or active-state data. Results use a five-minute Redis cache tagged with the catalog invalidation tag.

The product page records a successful view. The homepage and product page expose a clearable rail, excluding the currently viewed product where appropriate.

## Related-product recommendations

`GET /discovery/related/:slug?limit=4` scores up to 50 current active candidates and excludes the source product. The deterministic score combines:

```text
100 points  same category
0–40       price proximity
20         at least one in-stock variant
0–20       bounded rating average + review-count signal
```

Ties prefer newer catalog entries. Each result includes an explainable label such as `More in Accessories`, `Similar price`, or `Customer favourite`. The endpoint is cached for ten minutes and shares catalog invalidation, so catalog mutations cannot leave the recommendation cache independent of product data.

This is intentionally explainable catalog ranking, not collaborative filtering: the current dataset does not justify personal profiling or a separate recommendation service.

## Performance posture

- Primary hero/product images have intrinsic dimensions, eager loading, asynchronous decode, and high fetch priority.
- Product cards and secondary imagery are dimensioned and lazy-loaded.
- The storefront preconnects to the catalog image origin.
- Reviews, recently viewed, and related rails are split below the product page's primary interaction path.
- Recently viewed is disabled from homepage SSR because it depends on browser-local state.
- Sitemap catalog reads and product metadata use bounded revalidation.

## Accessibility posture

- A keyboard-visible skip link targets a stable main-content container.
- Global `:focus-visible` treatment covers links, buttons, fields, selects, textareas, and explicit tab stops.
- Reduced-motion preferences disable continuous ticker/carousel motion and collapse animation/transition duration.
- The hero has labeled carousel semantics, current-slide state, and an explicit pause/play control.
- Cart and product-image dialogs move focus inside, trap keyboard focus, support Escape, restore the opener, and prevent background focus/scroll.
- Product-image viewing also supports Left/Right arrow navigation.
- Navigation and breadcrumb landmarks are labeled.
- Newsletter input has a real label, autocomplete, and non-blocking status feedback.
- Private routes carry both crawler disallow rules and `noindex` metadata.

## Verification

- Discovery policy tests cover slug normalization/capping, same-category ranking priority, and explainable labels.
- Jest: 9 suites, 43 tests.
- Backend/frontend typechecks and production builds pass.
- Next generates 32 routes; robots, manifest, dynamic sitemap, product metadata, JSON-LD, discovery APIs, and all referenced route chunks pass live smoke checks.
- Frontend standalone output remains the Docker default; local Windows verification uses `NEXT_DISABLE_STANDALONE=1` because ordinary user sessions cannot create the required symlinks.
