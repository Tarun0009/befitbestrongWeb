"use client";

import { Suspense, useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  useGetCategoriesQuery,
  useSearchProductsQuery,
  type SearchSort,
} from "@/lib/catalogApi";
import { ProductCard } from "@/components/ProductCard";

const SORT_OPTIONS: { value: SearchSort; label: string }[] = [
  { value: "relevance", label: "Relevance" },
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
];

export default function ShopPage() {
  return (
    <Suspense fallback={<ShopPageSkeleton />}>
      <ShopContent />
    </Suspense>
  );
}

function ShopContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const q = searchParams.get("q") ?? undefined;
  const category = searchParams.get("category") ?? undefined;
  const minPriceParam = searchParams.get("minPrice");
  const maxPriceParam = searchParams.get("maxPrice");
  const sortParam = (searchParams.get("sort") as SearchSort | null) ?? undefined;
  const page = Number(searchParams.get("page") ?? "1");

  const minPrice = minPriceParam ? Number(minPriceParam) : undefined;
  const maxPrice = maxPriceParam ? Number(maxPriceParam) : undefined;
  const effectiveSort: SearchSort = sortParam ?? (q ? "relevance" : "newest");

  const searchArgs = useMemo(
    () => ({
      q,
      category,
      minPrice,
      maxPrice,
      sort: effectiveSort,
      page,
      limit: 12,
    }),
    [q, category, minPrice, maxPrice, effectiveSort, page],
  );

  const { data: catData } = useGetCategoriesQuery();
  const { data, isFetching, error } = useSearchProductsQuery(searchArgs);

  const [minInput, setMinInput] = useState(
    minPrice !== undefined ? String(minPrice / 100) : "",
  );
  const [maxInput, setMaxInput] = useState(
    maxPrice !== undefined ? String(maxPrice / 100) : "",
  );

  useEffect(() => {
    setMinInput(minPrice !== undefined ? String(minPrice / 100) : "");
    setMaxInput(maxPrice !== undefined ? String(maxPrice / 100) : "");
  }, [minPrice, maxPrice]);

  function pushQuery(next: {
    q?: string | null;
    category?: string | null;
    minPrice?: number | null;
    maxPrice?: number | null;
    sort?: SearchSort | null;
    page?: number | null;
  }) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === undefined || v === "") {
        params.delete(k);
      } else {
        params.set(k, String(v));
      }
    }
    if (next.page === undefined) params.delete("page");
    router.push(`/shop${params.toString() ? `?${params.toString()}` : ""}`);
  }

  function applyPriceFilter(e: FormEvent) {
    e.preventDefault();
    const min = minInput ? Math.round(Number(minInput) * 100) : null;
    const max = maxInput ? Math.round(Number(maxInput) * 100) : null;
    pushQuery({
      minPrice: Number.isFinite(min) ? min : null,
      maxPrice: Number.isFinite(max) ? max : null,
    });
  }

  const activeFilters =
    Number(!!q) +
    Number(!!category) +
    Number(minPrice !== undefined) +
    Number(maxPrice !== undefined);

  return (
    <main className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
      <header>
        <p className="text-sm uppercase tracking-widest text-muted-foreground">
          Storefront
        </p>
        <h1 className="mt-3 text-3xl font-semibold">
          {q ? `Results for "${q}"` : "Shop"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {data ? `${data.total} product${data.total === 1 ? "" : "s"}` : " "}
          {activeFilters > 0 && (
            <>
              {" | "}
              <button
                type="button"
                onClick={() =>
                  pushQuery({
                    q: null,
                    category: null,
                    minPrice: null,
                    maxPrice: null,
                    sort: null,
                  })
                }
                className="underline hover:text-foreground"
              >
                clear filters
              </button>
            </>
          )}
        </p>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[220px_1fr]">
        <aside className="space-y-6 text-sm">
          <section>
            <h2 className="mb-2 font-medium">Category</h2>
            <ul className="space-y-1">
              <li>
                <button
                  type="button"
                  onClick={() => pushQuery({ category: null })}
                  className={
                    !category
                      ? "font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }
                >
                  All
                </button>
              </li>
              {catData?.items.map((c) => (
                <li key={c.slug}>
                  <button
                    type="button"
                    onClick={() => pushQuery({ category: c.slug })}
                    className={
                      category === c.slug
                        ? "font-medium text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }
                  >
                    {c.name}{" "}
                    <span className="text-xs text-muted-foreground">
                      ({c.productCount})
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="mb-2 font-medium">Price (₹)</h2>
            <form onSubmit={applyPriceFilter} className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={minInput}
                  onChange={(e) => setMinInput(e.target.value)}
                  placeholder="Min"
                  className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                />
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={maxInput}
                  onChange={(e) => setMaxInput(e.target.value)}
                  placeholder="Max"
                  className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-md border border-border px-3 py-1.5 hover:bg-muted"
              >
                Apply
              </button>
            </form>
          </section>
        </aside>

        <section>
          <div className="flex items-center justify-between">
            <label className="text-sm text-muted-foreground">
              Sort by
              <select
                value={effectiveSort}
                onChange={(e) => pushQuery({ sort: e.target.value as SearchSort })}
                className="ml-2 rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              >
                {SORT_OPTIONS.map((o) => (
                  <option
                    key={o.value}
                    value={o.value}
                    disabled={o.value === "relevance" && !q}
                  >
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {error && (
            <div className="mt-6 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
              Failed to load products.
            </div>
          )}

          {isFetching && !data ? (
            <SkeletonGrid />
          ) : data && data.items.length === 0 ? (
            <p className="mt-10 text-sm text-muted-foreground">
              No products match those filters.
            </p>
          ) : (
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {data?.items.map((p, index) => (
                <ProductCard key={p.id} product={p} priority={index < 4} />
              ))}
            </div>
          )}

          {data && data.totalPages && data.totalPages > 1 && (
            <footer className="mt-10 flex items-center justify-between text-sm">
              <button
                type="button"
                disabled={(data.page ?? 1) <= 1}
                onClick={() => pushQuery({ page: (data.page ?? 1) - 1 })}
                className="rounded-md border border-border px-3 py-1.5 hover:bg-muted disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-muted-foreground">
                Page {data.page} of {data.totalPages}
              </span>
              <button
                type="button"
                disabled={(data.page ?? 1) >= data.totalPages}
                onClick={() => pushQuery({ page: (data.page ?? 1) + 1 })}
                className="rounded-md border border-border px-3 py-1.5 hover:bg-muted disabled:opacity-40"
              >
                Next
              </button>
            </footer>
          )}
        </section>
      </div>
    </main>
  );
}

function SkeletonGrid() {
  return (
    <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-72 animate-pulse rounded-lg bg-muted" />
      ))}
    </div>
  );
}

function ShopPageSkeleton() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
      <div className="h-8 w-40 animate-pulse rounded bg-muted" />
      <SkeletonGrid />
    </main>
  );
}
